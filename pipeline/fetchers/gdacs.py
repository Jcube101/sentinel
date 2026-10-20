import logging
from datetime import datetime, timedelta, timezone

from dateutil import parser as dateutil_parser

from fetchers.http import get_with_retry
from config import INDIA_BBOX, SHORT_RETENTION_DAYS

logger = logging.getLogger(__name__)

ENDPOINT = "https://www.gdacs.org/gdacsapi/api/events/geteventlist/SEARCH"

# The API returns at most 100 features per page, whatever pageSize asks for,
# and `country=IND` also matches Indonesia, so one page held only ~4 of the
# ~13 India events in the 90-day window. fetch() pages until a short page or
# a 204 (no content). MAX_PAGES is a runaway guard: 90 days is ~6 pages.
PAGE_SIZE = 100
MAX_PAGES = 50

# DR, WF and unknown types map to None → excluded from results.
# WF (wildfire) is kept out of `events`: EONET already carries the same
# GDACS wildfire alerts (same ids), so they would show twice on the map.
# The severity stage uses GDACS WF alerts only as the forest-fire trigger.
CATEGORY_MAP = {
    "EQ": "earthquake",
    "TC": "cyclone",
    "FL": "flood",
    "WF": None,
    "DR": None,
}

SEVERITY_MAP = {
    "Red": "extreme",
    "Orange": "high",
    "Green": "medium",
}


def _build_params(start_date: str | None = None, end_date: str | None = None) -> dict:
    today = datetime.now(timezone.utc)
    from_date = start_date or (today - timedelta(days=90)).strftime("%Y-%m-%d")
    to_date = end_date or today.strftime("%Y-%m-%d")
    return {
        "eventtypes": "EQ,TC,FL,WF,DR",
        "fromDate": from_date,
        "toDate": to_date,
        "alertlevel": "Green,Orange,Red",
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


def _fetch_features(params: dict) -> list[dict]:
    """Fetch every page of results for params.

    Request/parse failures on any page propagate — a broken endpoint must
    fail the run, not silently return a partial or empty list.
    """
    features: list[dict] = []
    for page in range(1, MAX_PAGES + 1):
        resp = get_with_retry(
            "GDACS", ENDPOINT, params={**params, "pageSize": PAGE_SIZE, "pageNumber": page}
        )
        if resp.status_code == 204:  # past the last page (or no events at all)
            break
        resp.raise_for_status()
        page_features = resp.json().get("features", [])
        features.extend(page_features)
        if len(page_features) < PAGE_SIZE:
            break
    else:
        logger.warning("GDACS: stopped after %d pages, results may be truncated", MAX_PAGES)
    return features


# Event types the severity desk reads from GDACS alerts (EQ comes from USGS).
ALERT_TYPES = {"FL", "TC", "WF", "EQ"}


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


def fetch(start_date: str | None = None, end_date: str | None = None) -> list[dict]:
    """Rows for the events table."""
    return fetch_detailed(start_date, end_date)[0]


def fetch_detailed(start_date: str | None = None, end_date: str | None = None) -> tuple[list[dict], dict]:
    """(events rows, {"alerts": [...]}) from one paged fetch.

    alerts holds every India-affecting FL/TC/WF/EQ event (see _to_alert) for
    the severity desk; the events rows are unchanged by it.
    """
    params = _build_params(start_date, end_date)
    logger.info(
        "GDACS: fetching events from=%s to=%s", params["fromDate"], params["toDate"]
    )

    features = _fetch_features(params)
    logger.info("GDACS: received %d features", len(features))

    alerts = {}
    for feature in features:
        try:
            alert = _to_alert(feature)
        except Exception as exc:
            logger.warning("GDACS: skipping alert due to error — %s", exc)
            continue
        if alert is not None:
            alerts[alert["id"]] = alert

    # The 90-day query returns events that started before the retention
    # window; _cleanup() would delete them right after they were written.
    retention_cutoff = datetime.now(timezone.utc) - timedelta(days=SHORT_RETENTION_DAYS)
    skipped_old = 0

    events = {}
    for feature in features:
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
    return list(events.values()), {"alerts": list(alerts.values())}


if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO, format="%(levelname)s %(name)s: %(message)s")
    results = fetch()
    print(f"\nTotal events: {len(results)}")
    print("\nFirst 3 results:")
    for event in results[:3]:
        print({k: v for k, v in event.items() if k != "raw"})
