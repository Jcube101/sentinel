"""National air-quality desk item (step 3 of docs/severity-pipeline.md).

One item, air:IN, levelled from approximate CPCB bands in Indian cities:

  1. stations: reference monitors (providers in severity.toml, CPCB and
     AirNow by default) from the OpenAQ fetcher's location list; each gets
     the city CPCB itself puts in the station name ("R K Puram, Delhi - DPCC")
  2. latest PM2.5 / PM10 for every such sensor, from OpenAQ's global
     /parameters/{id}/latest listing (the endpoint has no country filter)
  3. cities whose latest value is anywhere near "Poor" get the last 24 hours
     of hourly data for their stations (at most max_stations_per_city,
     spread across the city's range; capped per run, worst cities first)
  4. per station a 24 h mean (at least min_hours_for_mean hours); per city
     the mean over its stations; band = worst of PM2.5 and PM10 on CPCB
     breakpoints. CPCB's real AQI uses its own validated data and more
     pollutants, so the band is marked approximate in the item.

CPCB data reaches OpenAQ 2-3 days late, so the item carries the time the
data runs to (figures.data_as_of) as well as the band.
"""
import logging
import re
import time
from collections import defaultdict
from datetime import datetime, timedelta, timezone
from zoneinfo import ZoneInfo

import requests

import config
import desk

logger = logging.getLogger(__name__)

API = "https://api.openaq.org/v3"
PARAMETER_IDS = {"pm25": 2, "pm10": 1}
LATEST_PAGE_SIZE = 1000
MAX_LATEST_PAGES = 40          # pm25 is ~22 pages worldwide, pm10 ~14
ITEM_ID = "air:IN"
BANDS = ("severe", "very_poor", "poor")  # worst first
BAND_LABELS = {"severe": "Severe", "very_poor": "Very poor", "poor": "Poor"}
IST = ZoneInfo("Asia/Kolkata")
_STATE_CODE = re.compile(r"[A-Z]{2,3}")


# --- stations and cities ---------------------------------------------------------

def station_city(name: str, provider: str | None, aliases: dict[str, str]) -> str | None:
    """City for a monitor, as CPCB names it: "<site>, <City> - <agency>".

    "Sector - 125, Noida, UP - UPPCB" -> Noida (state code dropped);
    "Tata Stadium - Jorapokhar - JSPCB" -> Jorapokhar; AirNow names are the
    city ("New Delhi"). aliases merges names CPCB treats as one city.
    """
    name = (name or "").strip()
    if not name:
        return None
    if provider == "AirNow":
        city = name
    else:
        base = name.rsplit(" - ", 1)[0] if " - " in name else name
        parts = [p.strip() for p in base.split(",") if p.strip()]
        while len(parts) > 1 and _STATE_CODE.fullmatch(parts[-1]):
            parts.pop()
        if not parts:
            return None
        city = parts[-1].rsplit(" - ", 1)[-1].strip()
    return aliases.get(city, city) or None


def reference_stations(locations: list[dict], cfg: dict) -> list[dict]:
    """Reference monitors with their PM sensors and city."""
    air = cfg["air"]
    providers = set(air["providers"])
    aliases = air.get("city_aliases", {})
    out = []
    for loc in locations:
        provider = (loc.get("provider") or {}).get("name")
        if provider not in providers:
            continue
        sensors = {}
        for s in loc.get("sensors") or []:
            param = ((s.get("parameter") or {}).get("name") or "").lower()
            if param in PARAMETER_IDS:
                sensors.setdefault(param, []).append(s["id"])
        city = station_city(loc.get("name"), provider, aliases)
        if sensors and city:
            out.append({"location_id": loc["id"], "name": loc.get("name"), "provider": provider,
                        "city": city, "sensors": sensors})
    return out


# --- bands and level -----------------------------------------------------------------

def band(pollutant: str, value: float | None, cfg: dict) -> str | None:
    if value is None:
        return None
    b = cfg["air"][pollutant]
    if value > b["severe_above"]:
        return "severe"
    if value > b["very_poor_above"]:
        return "very_poor"
    if value > b["poor_above"]:
        return "poor"
    return None


def worst(*bands: str | None) -> str | None:
    ranked = [b for b in bands if b]
    return min(ranked, key=BANDS.index) if ranked else None


def air_level(counts: dict[str, int], cfg: dict) -> int | None:
    air = cfg["air"]
    if counts["severe"] >= air["level_4_min_severe_cities"]:
        return 4
    if counts["severe"] >= air["level_3_min_severe_cities"]:
        return 3
    if counts["very_poor"]:
        return 2
    if counts["poor"]:
        return 1
    return None


# --- OpenAQ access -------------------------------------------------------------------

class OpenAQ:
    """Small client that paces itself on OpenAQ's rate-limit headers."""

    def __init__(self, get=None, sleep=time.sleep):
        self._get = get or requests.get
        self._sleep = sleep
        self.requests = 0

    def get(self, path: str, params: dict) -> dict:
        for attempt in range(3):
            resp = self._get(f"{API}{path}", headers={"X-API-Key": config.OPENAQ_API_KEY},
                             params=params, timeout=30)
            self.requests += 1
            reset = min(int(resp.headers.get("X-Ratelimit-Reset", "10") or 10), 65) + 1
            if resp.status_code == 429 and attempt < 2:
                self._sleep(reset)
                continue
            resp.raise_for_status()
            if int(resp.headers.get("X-Ratelimit-Remaining", "10") or 10) <= 1:
                self._sleep(reset)
            return resp.json()
        raise RuntimeError("OpenAQ: still rate-limited after retries")


def latest_values(client: OpenAQ, wanted: set[int]) -> dict[int, tuple[float, datetime]]:
    """sensor id -> (latest value, its time) for the wanted sensors."""
    found = {}
    for pid in PARAMETER_IDS.values():
        for page in range(1, MAX_LATEST_PAGES + 1):
            rows = client.get(f"/parameters/{pid}/latest", {"limit": LATEST_PAGE_SIZE, "page": page})["results"]
            for row in rows:
                if row.get("sensorsId") in wanted and row.get("value") is not None:
                    when = desk._dt((row.get("datetime") or {}).get("utc"))
                    if when is not None:
                        found[row["sensorsId"]] = (float(row["value"]), when)
            if len(rows) < LATEST_PAGE_SIZE:
                break
    return found


def spread_sample(items: list, k: int, key) -> list:
    """k items evenly spaced across items sorted by key (all if <= k)."""
    if len(items) <= k:
        return list(items)
    ranked = sorted(items, key=key)
    if k == 1:
        return [ranked[len(ranked) // 2]]
    return [ranked[round(i * (len(ranked) - 1) / (k - 1))] for i in range(k)]


def mean_24h(client: OpenAQ, sensor_id: int, until: datetime, min_hours: int) -> float | None:
    """Mean of the 24 hourly values ending at `until`, or None if too few."""
    rows = client.get(f"/sensors/{sensor_id}/hours", {
        "datetime_from": (until - timedelta(hours=24)).isoformat(),
        "datetime_to": until.isoformat(), "limit": 100,
    })["results"]
    values = [float(r["value"]) for r in rows if r.get("value") is not None and float(r["value"]) >= 0]
    return sum(values) / len(values) if len(values) >= min_hours else None


# --- assessment -----------------------------------------------------------------------

def assess(stations: list[dict], client: OpenAQ, cfg: dict, now: datetime) -> dict:
    """City bands from 24 h means. Returns the figures for the air item.

    A station is fresh when its 24 h window (which ends at its newest
    reading) ends within fresh_within_hours. Only fresh stations count
    toward city bands and the level; stale ones are listed in
    figures["station_means"] with stale=True, budget permitting. With fewer
    than min_fresh_cities fresh cities, no history is fetched and
    quorum_met is False: the item keeps its last-known level.
    """
    air = cfg["air"]
    max_age = timedelta(hours=air["max_data_age_hours"])
    fresh_within = timedelta(hours=air["fresh_within_hours"])
    by_id = {st["location_id"]: st for st in stations}
    wanted = {sid for st in stations for ids in st["sensors"].values() for sid in ids}
    latest = latest_values(client, wanted) if wanted else {}

    # One current sensor per station and pollutant: the newest one.
    current = {}  # (location_id, pollutant) -> (sensor_id, value, when)
    for st in stations:
        for pollutant, ids in st["sensors"].items():
            recent = [(sid, *latest[sid]) for sid in ids if sid in latest and now - latest[sid][1] <= max_age]
            if recent:
                current[(st["location_id"], pollutant)] = max(recent, key=lambda t: t[2])

    def is_fresh(when: datetime) -> bool:
        return now - when <= fresh_within

    by_city = defaultdict(list)
    for st in stations:
        if any((st["location_id"], p) in current for p in PARAMETER_IDS):
            by_city[st["city"]].append(st)
    fresh_cities = {by_id[loc]["city"] for (loc, _), (_, _, when) in current.items() if is_fresh(when)}

    figures = {
        "approximate": True,
        "method": ("24 h mean of OpenAQ hourly PM2.5/PM10 at reference monitors ("
                   + ", ".join(air["providers"]) + "), CPCB AQI breakpoints"),
        "fresh_within_hours": air["fresh_within_hours"],
        "min_fresh_cities": air["min_fresh_cities"],
        "fresh_cities": len(fresh_cities),
        "quorum_met": len(fresh_cities) >= air["min_fresh_cities"],
        "cities_reporting": len(by_city),
        "stations_reporting": len({loc for loc, _ in current}),
        "counts": {b: 0 for b in BANDS},
        "cities": [],
        "station_means": [],
        "data_as_of": None,
        "oldest_data": None,
        "cities_assessed": 0,
        "history_requests": 0,
        "history_wanted": 0,
        "history_failed": 0,
        "capped": False,
    }
    if not figures["quorum_met"]:
        return figures  # no level from this data: skip the history requests

    # Which (city, pollutant) groups need 24 h history: a station's latest
    # value at or above prefilter_fraction x "poor". Fresh groups first,
    # worst first; stale ones only fill whatever budget is left.
    jobs = []  # (fresh, ratio, city, pollutant, location_id, sensor_id, until)
    for city, members in by_city.items():
        for pollutant in PARAMETER_IDS:
            reporting = [(st["location_id"], *current[(st["location_id"], pollutant)])
                         for st in members if (st["location_id"], pollutant) in current]
            for fresh in (True, False):
                group = [r for r in reporting if is_fresh(r[3]) == fresh]
                if not group:
                    continue
                peak = max(r[2] for r in group)
                if peak < air["prefilter_fraction"] * air[pollutant]["poor_above"]:
                    continue
                ratio = peak / air[pollutant]["poor_above"]
                for loc, sid, _, when in spread_sample(group, air["max_stations_per_city"], key=lambda r: r[2]):
                    jobs.append((fresh, ratio, city, pollutant, loc, sid, when))
    jobs.sort(key=lambda j: (not j[0], -j[1]))
    figures["history_wanted"] = len(jobs)
    figures["capped"] = len(jobs) > air["max_history_requests"]
    jobs = jobs[:air["max_history_requests"]]

    means = defaultdict(list)  # (city, pollutant) -> [fresh 24 h means]
    city_until = defaultdict(list)
    stale_count = defaultdict(int)
    station_means = []
    for fresh, _, city, pollutant, loc, sid, until in jobs:
        try:
            m = mean_24h(client, sid, until, air["min_hours_for_mean"])
        except Exception as exc:
            figures["history_failed"] += 1
            logger.warning("air: 24 h history failed for sensor %s — %s", sid, exc)
            continue
        if m is None:
            continue
        station_means.append({"station": by_id[loc]["name"], "city": city, "pollutant": pollutant,
                              "mean_24h": round(m, 1), "data_to": until.isoformat(), "stale": not fresh})
        if fresh:
            means[(city, pollutant)].append(m)
            city_until[city].append(until)
        else:
            stale_count[city] += 1

    cities = []
    for city in by_city:
        values = {p: (sum(means[(city, p)]) / len(means[(city, p)]) if means[(city, p)] else None)
                  for p in PARAMETER_IDS}
        b = worst(band("pm25", values["pm25"], cfg), band("pm10", values["pm10"], cfg))
        if b:
            cities.append({
                "city": city, "band": b,
                "pm25_24h": round(values["pm25"], 1) if values["pm25"] is not None else None,
                "pm10_24h": round(values["pm10"], 1) if values["pm10"] is not None else None,
                "stations": max(len(means[(city, p)]) for p in PARAMETER_IDS),
                "stale_stations": stale_count[city],
                "data_to": max(city_until[city]).isoformat(),
            })
    cities.sort(key=lambda c: (BANDS.index(c["band"]), -max(
        (c["pm25_24h"] or 0) / cfg["air"]["pm25"]["poor_above"],
        (c["pm10_24h"] or 0) / cfg["air"]["pm10"]["poor_above"])))
    station_means.sort(key=lambda r: (r["stale"], r["city"], r["pollutant"]))
    fresh_until = [t for ts in city_until.values() for t in ts]

    figures.update(
        counts={b: sum(1 for c in cities if c["band"] == b) for b in BANDS},
        cities=cities[:30],
        station_means=station_means,
        data_as_of=max(fresh_until).isoformat() if fresh_until else None,
        oldest_data=min(fresh_until).isoformat() if fresh_until else None,
        cities_assessed=len({city for _, _, city, _, _, _, _ in jobs}),
        history_requests=len(jobs),
    )
    return figures


def _names(cities: list[dict], limit: int = 3) -> str:
    names = [c["city"] for c in cities]
    shown = ", ".join(names[:limit])
    return shown + (f" and {len(names) - limit} more" if len(names) > limit else "")


def _as_of_text(cities: list[dict]) -> str:
    """When the named cities' data runs to: one time, or a date range if they differ."""
    times = sorted(t.astimezone(IST) for c in cities if (t := desk._dt(c.get("data_to"))))
    if not times:
        return "24 h mean, time unknown"
    newest, oldest = times[-1], times[0]
    if newest - oldest <= timedelta(hours=6):
        return f"24 h mean to {newest.strftime('%-d %b, %H:%M IST')}"
    if oldest.month == newest.month:
        return f"24 h means to {oldest.day}–{newest.strftime('%-d %b')}"
    return f"24 h means to {oldest.strftime('%-d %b')}–{newest.strftime('%-d %b')}"


def candidate(figures: dict, cfg: dict) -> desk.Candidate | None:
    level = air_level(figures["counts"], cfg)
    if level is None:
        return None
    top = figures["cities"][0]["band"]
    in_band = [c for c in figures["cities"] if c["band"] == top]
    label = BAND_LABELS[top]
    as_of = desk._dt(figures["data_as_of"])
    where = in_band[0]["city"] if len(in_band) == 1 else f"{len(in_band)} cities"
    return desk.Candidate(
        id=ITEM_ID, category="air", source="OPENAQ", source_ref=None,
        title=f"Air quality: {label.lower()} in {where}",
        place_name="India", latitude=None, longitude=None, level=level,
        reason=f"{label} in {_names(in_band)} (approx. CPCB band; {_as_of_text(in_band[:3])})",
        observed_at=as_of, source_updated_at=as_of, figures=figures,
    )


# --- stage -----------------------------------------------------------------------------

def run_air(supabase, run_id: int | None, results: dict, now: datetime, *, write: bool = True,
            cfg: dict | None = None, client: OpenAQ | None = None) -> dict:
    """Assess, reconcile and (if write) store the national air item.

    No new level (item kept last-known, reason says why) when the OpenAQ
    fetch failed, the assessment failed, too few cities have fresh data, or
    every history request failed.
    """
    cfg = cfg or desk.severity_config.load()
    air = cfg["air"]
    fetched = results["OpenAQ"]
    figures, cand, note = None, None, None
    if fetched.status != "ok":
        note = "OpenAQ fetch failed this run"
    else:
        stations = reference_stations(fetched.extras.get("locations", []), cfg)
        client = client or OpenAQ()
        try:
            figures = assess(stations, client, cfg, now)
        except Exception as exc:
            logger.error("air: assessment failed — %s", exc)
            note = "air assessment failed this run"
        else:
            if not figures["stations_reporting"]:
                note = "no reference monitors reporting"
            elif not figures["quorum_met"]:
                n = figures["fresh_cities"]
                note = (f"only {n} {'city has' if n == 1 else 'cities have'} data from the last "
                        f"{air['fresh_within_hours']} h (need {air['min_fresh_cities']})")
            elif figures["history_requests"] and figures["history_failed"] == figures["history_requests"]:
                note = "OpenAQ history requests failed this run"
            else:
                cand = candidate(figures, cfg)

    try:
        existing = desk.load_items(supabase, {"air"}, [ITEM_ID])
    except Exception as exc:
        if write:
            raise
        logger.warning("dry-run: could not read desk items — %s", exc)
        existing = {}
    items, snapshots = desk.reconcile(
        existing, [cand] if cand else [], categories={"air"}, source_good=note is None,
        open_min_level=air["lifecycle"]["open_min_level"],
        expired=lambda item: False, now=now, run_id=run_id, last_known_note=note)
    if write:
        desk.store(supabase, items, snapshots)
    return {
        "level": cand.level if cand else None,
        "reason": cand.reason if cand else None,
        "source_good": note is None,
        "note": note,
        "change": snapshots[0]["change"] if snapshots else None,
        "requests": client.requests if client else 0,
        "counts": figures["counts"] if figures else None,
        "stations": figures["stations_reporting"] if figures else 0,
        "fresh_cities": figures["fresh_cities"] if figures else 0,
    }
