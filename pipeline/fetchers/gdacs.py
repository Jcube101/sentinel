import logging
from datetime import datetime, timedelta, timezone

import requests
from dateutil import parser as dateutil_parser

from config import INDIA_BBOX

logger = logging.getLogger(__name__)

ENDPOINT = "https://www.gdacs.org/gdacsapi/api/events/geteventlist/SEARCH"

# DR and unknown types map to None → excluded from results
CATEGORY_MAP = {
    "EQ": "earthquake",
    "TC": "cyclone",
    "FL": "flood",
    "WF": "fire",
    "DR": None,
}

SEVERITY_MAP = {
    "Red": "extreme",
    "Orange": "high",
    "Green": "medium",
}


def _build_params(start_date: str | None = None, end_date: str | None = None) -> dict:
    today = datetime.utcnow()
    from_date = start_date or (today - timedelta(days=90)).strftime("%Y-%m-%d")
    to_date = end_date or today.strftime("%Y-%m-%d")
    return {
        "eventtypes": "EQ,TC,FL,WF,DR",
        "fromDate": from_date,
        "toDate": to_date,
        "alertlevel": "Green,Orange,Red",
        "country": "IND",
    }


def _parse_dt(value: str | None) -> str | None:
    if not value:
        return None
    try:
        dt = dateutil_parser.parse(value)
        if dt.tzinfo is None:
            dt = dt.replace(tzinfo=timezone.utc)
        return dt.isoformat()
    except Exception:
        return value


def _is_closed(props: dict) -> bool:
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


def fetch(start_date: str | None = None, end_date: str | None = None) -> list[dict]:
    params = _build_params(start_date, end_date)
    logger.info(
        "GDACS: fetching events from=%s to=%s", params["fromDate"], params["toDate"]
    )

    try:
        resp = requests.get(ENDPOINT, params=params, timeout=30)
        resp.raise_for_status()
        data = resp.json()
    except requests.RequestException as exc:
        logger.error("GDACS: request failed — %s", exc)
        return []
    except ValueError as exc:
        logger.error("GDACS: JSON parse failed — %s", exc)
        return []

    features = data.get("features", [])
    logger.info("GDACS: received %d features", len(features))

    events = []
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
            severity = SEVERITY_MAP.get(alertlevel, "low")
            status = "closed" if _is_closed(props) else "open"

            severity_value = props.get("episodealertlevel") or props.get("magnitude") or None
            try:
                severity_value = float(severity_value) if severity_value is not None else None
            except (TypeError, ValueError):
                severity_value = None

            events.append({
                "id": f"GDACS-{eventtype}-{eventid}",
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
                "created_at": None,
                "updated_at": None,
            })
        except Exception as exc:
            logger.warning(
                "GDACS: skipping feature due to error — %s | eventid=%s",
                exc,
                feature.get("properties", {}).get("eventid"),
            )

    logger.info("GDACS: transformed %d events", len(events))
    return events


if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO, format="%(levelname)s %(name)s: %(message)s")
    results = fetch()
    print(f"\nTotal events: {len(results)}")
    print("\nFirst 3 results:")
    for event in results[:3]:
        print({k: v for k, v in event.items() if k != "raw"})
