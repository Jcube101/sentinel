import logging
import time
from datetime import datetime, timedelta, timezone

import requests
from dateutil import parser as dateutil_parser

from fetchers.http import DEFAULT_TIMEOUT_S, get_with_retry
from config import GDACS_READ_TIMEOUT_S, INDIA_BBOX, SHORT_RETENTION_DAYS

logger = logging.getLogger(__name__)

ENDPOINT = "https://www.gdacs.org/gdacsapi/api/events/geteventlist/SEARCH"
# One event's full record: its impacts link to the storm's advisory timeline.
EVENT_DATA_URL = "https://www.gdacs.org/gdacsapi/api/events/geteventdata"

# The API returns at most 100 features per page, whatever pageSize asks for,
# and `country=IND` also matches Indonesia. Each query pages until a short
# page or a 204 (no content). MAX_PAGES is a runaway guard.
PAGE_SIZE = 100
MAX_PAGES = 50

# Three queries over the same 90-day window, in this order (fetch_detailed):
#   floods_cyclones  TC;FL  what desk.py levels: ~11 features, one page. Its
#                           failure is GDACS's failure for the run.
#   wildfires        WF     the fire desk's forest-fire trigger: ~2 pages
#                           (Indonesia's wildfires match country=IND). All or
#                           nothing; a failure leaves fire items their last
#                           known alerts, and the run goes on.
#   earthquakes      EQ     the events table only (USGS levels quakes): best
#                           effort; a failure keeps the pages it got.
# The API filters on `eventlist` (semicolons). Until 29 Oct 2026 the fetcher
# sent `eventtypes`, which the API ignores: every run got all types, droughts
# and volcanoes included, ~536 features in 6 pages, and one failed page cost
# the desk everything. Each query also keeps only its own types, in case the
# filter is ignored again.

# WF and unknown types map to None → excluded from results.
# WF (wildfire) is kept out of `events`: EONET already carries the same
# GDACS wildfire alerts (same ids), so they would show twice on the map.
# The severity stage uses GDACS WF alerts only as the forest-fire trigger.
CATEGORY_MAP = {
    "EQ": "earthquake",
    "TC": "cyclone",
    "FL": "flood",
    "WF": None,
}

SEVERITY_MAP = {
    "Red": "extreme",
    "Orange": "high",
    "Green": "medium",
}


def _build_params(start_date: str | None = None, end_date: str | None = None) -> dict:
    """The window and filters every query shares (not the event types)."""
    today = datetime.now(timezone.utc)
    from_date = start_date or (today - timedelta(days=90)).strftime("%Y-%m-%d")
    to_date = end_date or today.strftime("%Y-%m-%d")
    return {
        "fromDate": from_date,
        "toDate": to_date,
        "alertlevel": "Green;Orange;Red",
        "country": "IND",
    }


def _to_datetime(value: str | None) -> datetime | None:
    if not value:
        return None
    try:
        dt = dateutil_parser.parse(value)
    except Exception:
        return None
    return dt if dt.tzinfo else dt.replace(tzinfo=timezone.utc)


def _parse_dt(value: str | None) -> str | None:
    dt = _to_datetime(value)
    if dt is None:
        return value or None
    return dt.isoformat()


def _is_closed(props: dict) -> bool:
    # GDACS marks a finished event with iscurrent = "false" (a string).
    # The search API never sends isfinal, so the isfinal/todate check below
    # is only a fallback for a response without iscurrent.
    iscurrent = props.get("iscurrent")
    if iscurrent is not None:
        return str(iscurrent).strip().lower() == "false"

    isfinal = props.get("isfinal", False)
    todate_raw = props.get("todate")
    if not isfinal or not todate_raw:
        return False
    try:
        todate = dateutil_parser.parse(todate_raw)
        if todate.tzinfo is None:
            todate = todate.replace(tzinfo=timezone.utc)
        return todate < datetime.now(tz=timezone.utc)
    except Exception:
        return False


def _fetch_features(params: dict, label: str, out: list[dict]) -> None:
    """Fetch every page of results for params into out.

    Request/parse failures on any page propagate; out keeps the pages
    fetched before the failure (only the best-effort query uses them).

    Each page's time is logged (with retries, and the last request alone) to
    measure how slow the search API is.
    """
    for page in range(1, MAX_PAGES + 1):
        t0 = time.monotonic()
        resp = get_with_retry(
            "GDACS", ENDPOINT, params={**params, "pageSize": PAGE_SIZE, "pageNumber": page},
            timeout=(DEFAULT_TIMEOUT_S, GDACS_READ_TIMEOUT_S),
        )
        took = time.monotonic() - t0
        last = getattr(resp, "elapsed", None)
        last_text = f", last request {last.total_seconds():.1f} s" if last is not None else ""
        if resp.status_code == 204:  # past the last page (or no events at all)
            logger.info("GDACS: %s page %d: no content, %.1f s%s", label, page, took, last_text)
            break
        resp.raise_for_status()
        page_features = resp.json().get("features", [])
        logger.info("GDACS: %s page %d: %d features, %.1f s%s", label, page, len(page_features), took, last_text)
        out.extend(page_features)
        if len(page_features) < PAGE_SIZE:
            break
    else:
        logger.warning("GDACS: %s stopped after %d pages, results may be truncated", label, MAX_PAGES)


def _query(name: str, eventlist: str, params: dict, parts: dict) -> tuple[list[dict], Exception | None]:
    """One query's features (only its own event types) and its error, if
    any; records {status, features, duration_s[, error]} in parts[name]."""
    t0 = time.monotonic()
    got: list[dict] = []
    error = None
    try:
        _fetch_features({**params, "eventlist": eventlist}, name.replace("_", "/"), got)
    except Exception as exc:
        error = exc
    types = set(eventlist.split(";"))
    kept = [f for f in got if (f.get("properties") or {}).get("eventtype") in types]
    status = "ok" if error is None else ("timeout" if isinstance(error, requests.exceptions.Timeout) else "error")
    parts[name] = {"status": status, "features": len(kept), "duration_s": round(time.monotonic() - t0, 1)}
    if error is not None:
        parts[name]["error"] = str(error)[:300]
    return kept, error


# Event types the severity desk reads from GDACS alerts (quakes come from USGS).
ALERT_TYPES = {"FL", "TC", "WF"}


def _float(value) -> float | None:
    try:
        return float(value) if value is not None and value != "" else None
    except (TypeError, ValueError):
        return None


def _affects_india(props: dict) -> bool:
    countries = props.get("affectedcountries") or []
    if countries:
        return any((c or {}).get("iso3") == "IND" for c in countries)
    return props.get("iso3") == "IND"


def _to_alert(feature: dict) -> dict | None:
    """One GDACS event as the severity desk sees it, or None if not for India.

    Unlike the events rows, alerts are not cut to the India bbox or the
    retention window: a cyclone in the Arabian Sea heading for Gujarat, or a
    flood that started 70 days ago and is still current, still counts.
    """
    props = feature.get("properties") or {}
    eventtype = props.get("eventtype")
    if eventtype not in ALERT_TYPES or not _affects_india(props):
        return None
    coords = (feature.get("geometry") or {}).get("coordinates") or [None, None]
    severity = props.get("severitydata") or {}
    return {
        "id": f"GDACS-{eventtype}-{props.get('eventid')}",
        "eventtype": eventtype,
        "eventid": props.get("eventid"),
        "name": props.get("name") or props.get("eventname") or f"{eventtype} event {props.get('eventid')}",
        "alertlevel": props.get("alertlevel"),
        "alertscore": _float(props.get("alertscore")),
        "episodeid": props.get("episodeid"),
        "episodealertlevel": props.get("episodealertlevel") or props.get("alertlevel"),
        "episodealertscore": _float(props.get("episodealertscore")),
        "severity": _float(severity.get("severity")),
        "severity_text": (severity.get("severitytext") or "").strip() or None,
        "severity_unit": severity.get("severityunit") or None,
        "iscurrent": not _is_closed(props),
        "fromdate": _parse_dt(props.get("fromdate")),
        "todate": _parse_dt(props.get("todate")),
        "datemodified": _parse_dt(props.get("datemodified")),
        "latitude": _float(coords[1]) if len(coords) > 1 else None,
        "longitude": _float(coords[0]),
        "countries": [c.get("iso3") for c in props.get("affectedcountries") or [] if c and c.get("iso3")],
        "country_names": [c.get("countryname") for c in props.get("affectedcountries") or [] if c and c.get("countryname")],
        "url": (props.get("url") or {}).get("report") or "https://www.gdacs.org/",
    }


def _storm_track(eventid) -> list[dict]:
    """A cyclone's observed track, oldest first: one point per advisory (JTWC's,
    every 6 h while the storm is tracked), with its wind in km/h. The search API
    gives only the storm's peak wind; the per-advisory winds are in the
    timeline that the event's record links to (two requests). Forecast points
    are left out. The timeline's wind_speed is in m/s: ARNAB-26's peak, 61.728,
    is GDACS's "maximum wind speed of 222 km/h" (checked 30 Oct 2026)."""
    resp = get_with_retry("GDACS", EVENT_DATA_URL, params={"eventtype": "TC", "eventid": eventid})
    resp.raise_for_status()
    impacts = (resp.json().get("properties") or {}).get("impacts") or []
    url = next((r["timeline"] for i in impacts if (r := (i or {}).get("resource") or {}).get("timeline")), None)
    if not url:
        raise ValueError("the event record links no timeline")
    resp = get_with_retry("GDACS", url)
    resp.raise_for_status()
    items = (resp.json().get("channel") or {}).get("item") or []
    if isinstance(items, dict):
        items = [items]
    points = {}
    for it in items:
        if str(it.get("actual")).strip().lower() != "true":
            continue
        at = datetime.strptime(str(it["advisory_datetime"]).strip(), "%d %b %Y %H:%M").replace(tzinfo=timezone.utc)
        wind = _float(it.get("wind_speed"))
        status = it.get("storm_status")
        if isinstance(status, list):
            status = next((x for x in status if x), None)
        points[at] = {
            "at": at.isoformat(),
            "latitude": _float(it.get("latitude")),
            "longitude": _float(it.get("longitude")),
            "wind_kmh": round(wind * 3.6) if wind is not None else None,
            "storm_status": status or None,
        }
    return [points[at] for at in sorted(points)]


def _add_tracks(alerts: list[dict], parts: dict) -> None:
    """Each current India cyclone's track into its alert["track"]. Best effort:
    a storm whose track can't be read keeps only the search API's peak wind,
    and the failure is recorded in parts["tracks"], never failing the run."""
    storms = [a for a in alerts if a["eventtype"] == "TC" and a["iscurrent"]]
    if not storms:
        return
    t0 = time.monotonic()
    errors = []
    for alert in storms:
        try:
            alert["track"] = _storm_track(alert["eventid"])
        except Exception as exc:
            errors.append(f"{alert['id']}: {exc}")
            logger.warning("GDACS: no track for %s, its wind stays the storm's peak — %s", alert["id"], exc)
    parts["tracks"] = {"status": "error" if errors else "ok", "features": len(storms) - len(errors),
                       "duration_s": round(time.monotonic() - t0, 1)}
    if errors:
        parts["tracks"]["error"] = "; ".join(errors)[:300]
    logger.info("GDACS: tracks for %d of %d current cyclones, %.1f s", len(storms) - len(errors), len(storms),
                parts["tracks"]["duration_s"])


def fetch(start_date: str | None = None, end_date: str | None = None) -> list[dict]:
    """Rows for the events table."""
    return fetch_detailed(start_date, end_date)[0]


def fetch_detailed(start_date: str | None = None, end_date: str | None = None) -> tuple[list[dict], dict]:
    """(events rows, {"alerts", "wildfires_ok", "parts"}) from the three queries above.

    Raises only when the floods/cyclones query fails (GDACS failed for the
    run). alerts holds every India-affecting FL/TC event and, when
    wildfires_ok, every WF event (see _to_alert); a current cyclone's alert
    also has its observed "track" (_storm_track) when GDACS gave it. The events rows come from
    the floods/cyclones query plus whatever the earthquake query got. parts:
    each query's status, feature count, time and error, for pipeline_runs.
    """
    params = _build_params(start_date, end_date)
    logger.info(
        "GDACS: fetching events from=%s to=%s", params["fromDate"], params["toDate"]
    )

    parts: dict[str, dict] = {}
    floods_cyclones, error = _query("floods_cyclones", "TC;FL", params, parts)
    if error is not None:
        raise error
    wildfires, wf_error = _query("wildfires", "WF", params, parts)
    if wf_error is not None:
        logger.warning("GDACS: wildfire alerts failed, fire items keep their last known alerts — %s", wf_error)
        wildfires = []
    earthquakes, eq_error = _query("earthquakes", "EQ", params, parts)
    if eq_error is not None:
        logger.warning("GDACS: earthquake events failed, keeping the %d fetched before it (best effort) — %s",
                       len(earthquakes), eq_error)
    logger.info("GDACS: received %s", ", ".join(f"{n} {p['features']} ({p['status']})" for n, p in parts.items()))

    alerts = {}
    for feature in floods_cyclones + wildfires:
        try:
            alert = _to_alert(feature)
        except Exception as exc:
            logger.warning("GDACS: skipping alert due to error — %s", exc)
            continue
        if alert is not None:
            alerts[alert["id"]] = alert
    _add_tracks(list(alerts.values()), parts)

    # The 90-day query returns events that started before the retention
    # window; _cleanup() would delete them right after they were written.
    retention_cutoff = datetime.now(timezone.utc) - timedelta(days=SHORT_RETENTION_DAYS)
    skipped_old = 0

    events = {}
    for feature in floods_cyclones + earthquakes:
        try:
            props = feature.get("properties", {})
            geometry = feature.get("geometry", {})

            eventtype = props.get("eventtype", "")
            eventid = props.get("eventid", "")
            alertlevel = props.get("alertlevel", "")

            coords = geometry.get("coordinates", [])
            if not coords:
                logger.warning("GDACS: skipping %s-%s — no coordinates", eventtype, eventid)
                continue

            # GeoJSON Point: [lon, lat]
            lon, lat = float(coords[0]), float(coords[1])

            # Skip events outside India's bounding box
            if not (
                INDIA_BBOX["south"] <= lat <= INDIA_BBOX["north"]
                and INDIA_BBOX["west"] <= lon <= INDIA_BBOX["east"]
            ):
                logger.debug("GDACS: skipping %s-%s — outside India bbox (%.2f, %.2f)", eventtype, eventid, lat, lon)
                continue

            # Skip unknown or excluded event types (DR, etc.)
            category = CATEGORY_MAP.get(eventtype)
            if category is None:
                logger.debug("GDACS: skipping %s-%s — unmapped eventtype", eventtype, eventid)
                continue
            started = _to_datetime(props.get("fromdate"))
            if started is not None and started < retention_cutoff:
                skipped_old += 1
                continue

            severity = SEVERITY_MAP.get(alertlevel, "low")
            status = "closed" if _is_closed(props) else "open"

            severity_value = props.get("episodealertlevel") or props.get("magnitude") or None
            try:
                severity_value = float(severity_value) if severity_value is not None else None
            except (TypeError, ValueError):
                severity_value = None

            # Keyed by id: results can shift between page requests, so an
            # event may arrive twice; the later copy wins.
            event_id = f"GDACS-{eventtype}-{eventid}"
            events[event_id] = {
                "id": event_id,
                "external_id": str(eventid),
                "source": "GDACS",
                "category": category,
                "title": props.get("eventname") or props.get("htmldescription") or f"{eventtype} event {eventid}",
                "description": (
                    f"GDACS {props.get('eventname', '')} — "
                    f"Alert: {alertlevel}, "
                    f"Country: {props.get('country', 'N/A')}, "
                    f"Episode: {props.get('episodeid', 'N/A')}."
                ),
                "severity": severity,
                "severity_value": severity_value,
                "severity_unit": "magnitude" if eventtype == "EQ" else None,
                "status": status,
                "started_at": _parse_dt(props.get("fromdate")),
                "closed_at": _parse_dt(props.get("todate")) if status == "closed" else None,
                "latitude": lat,
                "longitude": lon,
                "place_name": props.get("country") or None,
                "geometry": geometry,
                "source_url": props.get("url", {}).get("report") or "https://www.gdacs.org/",
                "raw": props,
            }
        except Exception as exc:
            logger.warning(
                "GDACS: skipping feature due to error — %s | eventid=%s",
                exc,
                feature.get("properties", {}).get("eventid"),
            )

    logger.info(
        "GDACS: transformed %d events (skipped %d that started more than %d days ago), %d India alerts",
        len(events), skipped_old, SHORT_RETENTION_DAYS, len(alerts),
    )
    return list(events.values()), {"alerts": list(alerts.values()), "wildfires_ok": wf_error is None,
                                   "parts": parts}


if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO, format="%(levelname)s %(name)s: %(message)s")
    results = fetch()
    print(f"\nTotal events: {len(results)}")
    print("\nFirst 3 results:")
    for event in results[:3]:
        print({k: v for k, v in event.items() if k != "raw"})
