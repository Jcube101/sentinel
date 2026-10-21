"""National air-quality desk item (step 3 of docs/severity-pipeline.md).

One item, air:IN, levelled from CPCB bands in Indian cities. Two sources:

Primary: CPCB's real-time AQI on data.gov.in (datagov.py, assess_feed):
CPCB's own sub-indices per station and pollutant; station AQI = highest
sub-index (at least 3 pollutants incl. PM2.5 or PM10), city AQI = mean of
its stations, band from CPCB's AQI categories. Hourly, unvalidated; the
reason says "CPCB AQI, real-time (unvalidated)".

Fallback, when the feed fails, is older than [air.datagov]
max_snapshot_age_hours or has too few cities: approximate CPCB bands from
OpenAQ (the reason says "approx. CPCB band"):

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
import math
import re
import time
from collections import defaultdict
from datetime import datetime, timedelta, timezone
from zoneinfo import ZoneInfo

import requests

import config
import datagov
import desk
import runs

logger = logging.getLogger(__name__)

API = "https://api.openaq.org/v3"
PARAMETER_IDS = {"pm25": 2, "pm10": 1}
LATEST_PAGE_SIZE = 1000
MAX_LATEST_PAGES = 40          # pm25 is ~22 pages worldwide, pm10 ~14
ITEM_ID = "air:IN"
WATCH_CITIES = 10                         # worst cities kept in figures for the watching list
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


def band_ratio(city: dict, band_name: str, cfg: dict) -> float:
    """How far a city's 24 h means are toward a band: the higher of
    pm25 / pm25 threshold and pm10 / pm10 threshold (1.0 = at the threshold)."""
    return max((city.get(f"{p}_24h") or 0) / cfg["air"][p][f"{band_name}_above"] for p in PARAMETER_IDS)


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
        "source": "openaq",
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
        "worst_cities": [],
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

    cities, measured = [], []
    for city in by_city:
        values = {p: (sum(means[(city, p)]) / len(means[(city, p)]) if means[(city, p)] else None)
                  for p in PARAMETER_IDS}
        if any(v is not None for v in values.values()):
            measured.append({"city": city, **{f"{p}_24h": round(v, 1) for p, v in values.items() if v is not None}})
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

    measured.sort(key=lambda c: -band_ratio(c, "poor", cfg))
    figures.update(
        counts={b: sum(1 for c in cities if c["band"] == b) for b in BANDS},
        cities=cities[:30],
        worst_cities=measured[:WATCH_CITIES],  # any band, for the watching list (watch_subject)
        station_means=station_means,
        data_as_of=max(fresh_until).isoformat() if fresh_until else None,
        oldest_data=min(fresh_until).isoformat() if fresh_until else None,
        cities_assessed=len({city for _, _, city, _, _, _, _ in jobs}),
        history_requests=len(jobs),
    )
    return figures


# --- data.gov.in feed (primary) -----------------------------------------------------------

def aqi_band(aqi: float | None, cfg: dict) -> str | None:
    """CPCB AQI category: Poor 201-300, Very poor 301-400, Severe 401-500."""
    if aqi is None:
        return None
    t = cfg["air"]["aqi"]
    if aqi > t["severe_above"]:
        return "severe"
    if aqi > t["very_poor_above"]:
        return "very_poor"
    if aqi > t["poor_above"]:
        return "poor"
    return None


def assess_feed(records: list[dict], cfg: dict, now: datetime, requests_made: int = 0) -> dict:
    """City AQIs from the data.gov.in feed, the way CPCB computes them."""
    air, feed = cfg["air"], cfg["air"]["datagov"]
    aliases = air.get("city_aliases", {})
    listed = datagov.stations(records)
    by_city = defaultdict(list)  # city -> [(station AQI, prominent pollutants, state)]
    for name, st in listed.items():
        aqi, top = datagov.station_aqi(st["sub_indices"], feed["min_pollutants"])
        city = st["city"] or station_city(name, "CPCB", aliases)
        city = aliases.get(city, city)
        if aqi is not None and city:
            by_city[city].append((aqi, top, st["state"]))
    snapshot = max((st["updated"] for st in listed.values() if st["updated"]), default=None)

    cities, measured = [], []
    for city, rows in by_city.items():
        value = math.floor(sum(r[0] for r in rows) / len(rows) + 0.5)  # CPCB reports whole numbers
        measured.append({"city": city, "aqi": value})
        b = aqi_band(value, cfg)
        if b:
            cities.append({"city": city, "band": b, "aqi": value, "stations": len(rows), "state": rows[0][2],
                           "prominent": datagov.prominent([r[1] for r in rows])})
    cities.sort(key=lambda c: (BANDS.index(c["band"]), -c["aqi"], c["city"]))
    measured.sort(key=lambda c: (-c["aqi"], c["city"]))
    return {
        "source": "datagov",
        "approximate": False,
        "unvalidated": True,
        "method": ("CPCB AQI from CPCB's real-time sub-indices on data.gov.in: station AQI = highest sub-index "
                   f"(at least {feed['min_pollutants']} pollutants incl. PM2.5 or PM10), city AQI = mean of its stations"),
        "dataset": datagov.DATASET_URL,
        "snapshot_at": snapshot.isoformat() if snapshot else None,
        "data_as_of": snapshot.isoformat() if snapshot else None,
        "snapshot_age_hours": round((now - snapshot).total_seconds() / 3600, 1) if snapshot else None,
        "max_snapshot_age_hours": feed["max_snapshot_age_hours"],
        "stations_listed": len(listed),
        "stations_reporting": sum(len(rows) for rows in by_city.values()),
        "cities_reporting": len(by_city),
        "fresh_cities": len(by_city),
        "min_fresh_cities": air["min_fresh_cities"],
        "quorum_met": len(by_city) >= air["min_fresh_cities"],
        "counts": {b: sum(1 for c in cities if c["band"] == b) for b in BANDS},
        "cities": cities,
        "worst_cities": measured[:WATCH_CITIES],
        "requests": requests_made,
    }


def apply_severe_guard(figures: dict, previous: dict | None, cfg: dict) -> None:
    """Unvalidated data: a Severe city counts as Severe only once it has been
    Severe in severe_confirm_runs consecutive assessments (streaks are kept
    in the item's figures); until then it counts as Very poor. Recomputes
    figures["counts"] and orders cities by what they count as."""
    need = cfg["air"]["severe_confirm_runs"]
    before = (previous or {}).get("severe_streaks") or {}
    streaks, unconfirmed = {}, []
    for c in figures["cities"]:
        if c["band"] == "severe":
            n = streaks[c["city"]] = int(before.get(c["city"], 0)) + 1
            c["severe_confirmed"] = n >= need
            c["counted_as"] = "severe" if n >= need else "very_poor"
            if n < need:
                unconfirmed.append(c["city"])
        else:
            c["counted_as"] = c["band"]
    figures["cities"].sort(key=lambda c: BANDS.index(c["counted_as"]))  # stable: worst first within each
    figures["counts"] = {b: sum(1 for c in figures["cities"] if c["counted_as"] == b) for b in BANDS}
    figures.update(severe_streaks=streaks, severe_unconfirmed=unconfirmed, severe_confirm_runs=need)


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


def _counted(city: dict) -> str:
    return city.get("counted_as") or city["band"]


def candidate(figures: dict, cfg: dict) -> desk.Candidate | None:
    """The air:IN candidate; its reason names the source that set the level."""
    level = air_level(figures["counts"], cfg)
    if level is None:
        return None
    top = _counted(figures["cities"][0])
    in_band = [c for c in figures["cities"] if _counted(c) == top]
    label = BAND_LABELS[top]
    as_of = desk._dt(figures["data_as_of"])
    where = in_band[0]["city"] if len(in_band) == 1 else f"{len(in_band)} cities"
    if figures.get("source") == "datagov":
        source = datagov.SOURCE_ID
        note = "CPCB AQI, real-time (unvalidated)" + (
            f"; to {as_of.astimezone(IST).strftime('%-d %b, %H:%M IST')}" if as_of else "")
    else:
        source, note = "OPENAQ", f"approx. CPCB band; {_as_of_text(in_band[:3])}"
    reason = f"{label} in {_names(in_band)} ({note})"
    pending = figures.get("severe_unconfirmed") or []
    if pending:
        reason += (f" · Severe in {_names([{'city': c} for c in pending])} not yet confirmed "
                   f"(needs {figures['severe_confirm_runs']} runs in a row)")
    return desk.Candidate(
        id=ITEM_ID, category="air", source=source, source_ref=None,
        title=f"Air quality: {label.lower()} in {where}",
        place_name="India", latitude=None, longitude=None, level=level,
        reason=reason, observed_at=as_of, source_updated_at=as_of, figures=figures,
    )


def _worst_text(k: int) -> str:
    if k == 1:
        return "worst city"
    suffix = {2: "nd", 3: "rd"}.get(k, "th")
    return f"{k}{suffix}-worst city"


def watch_subject(figures: dict, level: int | None, item_open: bool, cfg: dict) -> desk.WatchSubject:
    """air:IN against its next level: the city the next level hinges on (the
    worst for Poor and Very poor, the Nth-worst for Severe in N cities)
    against the band's start: its CPCB AQI with the data.gov.in feed, its
    24 h mean in the pollutant closest to that band with the OpenAQ fallback.
    A Severe city still waiting for confirmation is past the threshold."""
    air = cfg["air"]
    steps = {None: (1, "poor", 1), 1: (2, "very_poor", 1), 2: (3, "severe", air["level_3_min_severe_cities"]),
             3: (4, "severe", air["level_4_min_severe_cities"])}
    next_level = metric = value = threshold = None
    if level in steps and figures.get("source") == "datagov":
        next_level, band_name, k = steps[level]
        ranked = sorted(figures.get("worst_cities") or [], key=lambda c: -c["aqi"])
        if len(ranked) >= k:
            city = ranked[k - 1]
            value, threshold = city["aqi"], air["aqi"][f"{band_name}_above"]
            metric = (f"CPCB AQI in {city['city']}, the {_worst_text(k)}; "
                      f"{BAND_LABELS[band_name]} starts above {threshold:g}")
    elif level in steps:
        next_level, band_name, k = steps[level]
        ranked = sorted(figures.get("worst_cities") or [], key=lambda c: -band_ratio(c, band_name, cfg))
        if len(ranked) >= k:
            city = ranked[k - 1]
            p = max(PARAMETER_IDS, key=lambda p: (city.get(f"{p}_24h") or 0) / air[p][f"{band_name}_above"])
            value, threshold = city[f"{p}_24h"], air[p][f"{band_name}_above"]
            metric = (f"{'PM2.5' if p == 'pm25' else 'PM10'} 24 h mean (µg/m³) in {city['city']}, "
                      f"the {_worst_text(k)}; {BAND_LABELS[band_name]} starts above {threshold:g}")
    return desk.WatchSubject(
        id=ITEM_ID, category="air", title="Air quality (India)", item_id=ITEM_ID if item_open else None,
        level=level, next_level=next_level, metric=metric, value=value, threshold=threshold,
        source_updated_at=desk._dt(figures.get("data_as_of")))


# --- stage -----------------------------------------------------------------------------

def try_feed(feed, cfg: dict, now: datetime) -> tuple[dict | None, dict, str | None]:
    """Read and assess the data.gov.in feed.

    Returns (figures if the feed can set the level else None, the attempt
    for the DATAGOV sources row, why the feed was not used).
    """
    feed = feed or (lambda: datagov.fetch(config.DATA_GOV_IN_API_KEY))
    attempt = {"status": "error", "error": None, "rows": 0, "newest": None, "requests": 0, "duration_s": 0.0}
    t0 = time.monotonic()
    try:
        records, made = feed()
    except datagov.FeedError as exc:
        attempt.update(status=exc.status, error=str(exc), duration_s=time.monotonic() - t0)
        return None, attempt, f"data.gov.in feed failed ({exc})"
    except Exception as exc:
        attempt.update(error=runs.redact(f"{type(exc).__name__}: {exc}"), duration_s=time.monotonic() - t0)
        return None, attempt, "data.gov.in feed failed"
    attempt.update(rows=len(records), requests=made, duration_s=time.monotonic() - t0)
    try:
        figures = assess_feed(records, cfg, now, made)
    except Exception as exc:
        logger.error("air: data.gov.in assessment failed — %s", exc)
        attempt.update(error=runs.redact(f"assessment failed: {type(exc).__name__}: {exc}"))
        return None, attempt, "data.gov.in feed could not be read"
    snapshot = desk._dt(figures["snapshot_at"])
    attempt.update(status="ok", newest=snapshot)
    max_age = cfg["air"]["datagov"]["max_snapshot_age_hours"]
    if snapshot is None:
        return None, attempt, "data.gov.in feed has no snapshot time"
    age = (now - snapshot).total_seconds() / 3600
    if age > max_age:
        return None, attempt, f"data.gov.in snapshot is {age:.0f} h old (max {max_age:g} h)"
    if not figures["quorum_met"]:
        n = figures["cities_reporting"]
        return None, attempt, (f"data.gov.in: only {n} {'city has' if n == 1 else 'cities have'} a CPCB AQI "
                               f"(need {cfg['air']['min_fresh_cities']})")
    return figures, attempt, None


def openaq_assessment(results: dict, cfg: dict, now: datetime, client: OpenAQ | None):
    """The OpenAQ fallback. Returns (figures, why there is no new level or None, client)."""
    air = cfg["air"]
    fetched = results["OpenAQ"]
    if fetched.status != "ok":
        return None, "OpenAQ fetch failed this run", client
    stations = reference_stations(fetched.extras.get("locations", []), cfg)
    client = client or OpenAQ()
    try:
        figures = assess(stations, client, cfg, now)
    except Exception as exc:
        logger.error("air: assessment failed — %s", exc)
        return None, "air assessment failed this run", client
    if not figures["stations_reporting"]:
        return figures, "no reference monitors reporting", client
    if not figures["quorum_met"]:
        n = figures["fresh_cities"]
        return figures, (f"only {n} {'city has' if n == 1 else 'cities have'} data from the last "
                         f"{air['fresh_within_hours']} h (need {air['min_fresh_cities']})"), client
    if figures["history_requests"] and figures["history_failed"] == figures["history_requests"]:
        return figures, "OpenAQ history requests failed this run", client
    return figures, None, client


def record_feed(supabase, run_id: int | None, attempt: dict, now: datetime) -> dict:
    """Write the feed attempt to the DATAGOV sources row; return it in the
    shape of pipeline_runs.sources entries."""
    prev = (supabase.table(runs.SOURCES_TABLE).select("id,newest_observation_at")
            .eq("id", datagov.SOURCE_ID).execute().data)
    update, new_data = runs.freshness_update(attempt["status"], attempt["error"], attempt["rows"],
                                             attempt["newest"], prev[0] if prev else None, run_id, now)
    resp = supabase.table(runs.SOURCES_TABLE).update(update).eq("id", datagov.SOURCE_ID).execute()
    if not resp.data:
        logger.warning("air: no sources row with id=%s (migration 006), freshness not recorded", datagov.SOURCE_ID)
    return {
        "status": attempt["status"],
        "rows": attempt["rows"],
        "duration_s": round(attempt["duration_s"], 1),
        "error": runs.redact(attempt["error"]),
        "newest_observation_at": attempt["newest"].isoformat() if attempt["newest"] else None,
        "new_data": new_data,
    }


def run_air(supabase, run_id: int | None, results: dict, now: datetime, *, write: bool = True,
            cfg: dict | None = None, client: OpenAQ | None = None, feed=None) -> dict:
    """Assess, reconcile and (if write) store the national air item.

    The data.gov.in feed sets the level when it is readable, at most
    [air.datagov] max_snapshot_age_hours old and has min_fresh_cities
    cities; otherwise the OpenAQ assessment does. No new level (item kept
    last-known, reason says why) when neither can. feed: callable returning
    (records, requests made); defaults to datagov.fetch with the configured key.
    """
    cfg = cfg or desk.severity_config.load()
    air = cfg["air"]
    try:
        existing = desk.load_items(supabase, {"air"}, [ITEM_ID])
    except Exception as exc:
        if write:
            raise
        logger.warning("dry-run: could not read desk items — %s", exc)
        existing = {}

    figures, attempt, fallback_reason = try_feed(feed, cfg, now)
    note = None
    if figures is None:
        figures, note, client = openaq_assessment(results, cfg, now, client)
        if figures is not None:
            figures["fallback_reason"] = fallback_reason
        if note:
            note = f"{fallback_reason}; {note}"
    cand = None
    if note is None:
        apply_severe_guard(figures, (existing.get(ITEM_ID) or {}).get("figures"), cfg)
        figures["cities"] = figures["cities"][:30]
        cand = candidate(figures, cfg)

    items, snapshots = desk.reconcile(
        existing, [cand] if cand else [], categories={"air"}, source_good=note is None,
        open_min_level=air["lifecycle"]["open_min_level"],
        expired=lambda item: False, now=now, run_id=run_id, last_known_note=note)
    feed_summary = None
    if write:
        desk.store(supabase, items, snapshots)
        feed_summary = record_feed(supabase, run_id, attempt, now)
    item_open = any(i["id"] == ITEM_ID and i["status"] == "open" for i in items)
    used_feed = note is None and fallback_reason is None
    return {
        "items": items,
        "watch": [watch_subject(figures, cand.level if cand else None, item_open, cfg)] if note is None else [],
        "level": cand.level if cand else None,
        "reason": cand.reason if cand else None,
        "source_good": note is None,
        "note": note,
        "source": ("data.gov.in" if used_feed else "OpenAQ") if note is None else None,
        "source_id": datagov.SOURCE_ID if used_feed else "OPENAQ",
        "source_status": attempt["status"] if used_feed else results["OpenAQ"].status,
        "fallback_reason": fallback_reason,
        "datagov": feed_summary,
        "change": snapshots[0]["change"] if snapshots else None,
        "requests": attempt["requests"] + (client.requests if client else 0),
        "counts": figures["counts"] if figures else None,
        "stations": figures["stations_reporting"] if figures else 0,
        "fresh_cities": figures["fresh_cities"] if figures else 0,
        "severe_unconfirmed": (figures or {}).get("severe_unconfirmed") or [],
    }
