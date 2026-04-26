import logging
from datetime import datetime, timedelta, timezone

import requests

from config import INDIA_BBOX_USGS

logger = logging.getLogger(__name__)

ENDPOINT = "https://earthquake.usgs.gov/fdsnws/event/1/query"
_7_DAYS_MS = 7 * 24 * 60 * 60 * 1000


def _build_params(start_date: str | None = None, end_date: str | None = None) -> dict:
    now = datetime.now(tz=timezone.utc)
    return {
        "format": "geojson",
        "minlatitude": INDIA_BBOX_USGS["minlatitude"],
        "maxlatitude": INDIA_BBOX_USGS["maxlatitude"],
        "minlongitude": INDIA_BBOX_USGS["minlongitude"],
        "maxlongitude": INDIA_BBOX_USGS["maxlongitude"],
        "minmagnitude": 4.0,
        "orderby": "time",
        "limit": 500,
        "starttime": start_date or (now - timedelta(days=90)).strftime("%Y-%m-%d"),
        "endtime": end_date or now.strftime("%Y-%m-%d"),
    }


def _severity(mag: float) -> str:
    if mag >= 7.0:
        return "extreme"
    if mag >= 6.0:
        return "high"
    if mag >= 5.0:
        return "medium"
    return "low"


def _ms_to_iso(ms: int) -> str:
    return datetime.fromtimestamp(ms / 1000, tz=timezone.utc).isoformat()


def _is_closed(props: dict) -> bool:
    # Treat as closed when USGS has reviewed it and the event is older than 7 days
    status = props.get("status", "")
    time_ms = props.get("time")
    if status != "reviewed" or time_ms is None:
        return False
    now_ms = datetime.now(tz=timezone.utc).timestamp() * 1000
    return (now_ms - time_ms) > _7_DAYS_MS


def fetch(start_date: str | None = None, end_date: str | None = None) -> list[dict]:
    params = _build_params(start_date, end_date)
    logger.info(
        "USGS: fetching earthquakes starttime=%s endtime=%s minmag=4.0",
        params["starttime"], params["endtime"],
    )

    try:
        resp = requests.get(ENDPOINT, params=params, timeout=30)
        resp.raise_for_status()
        data = resp.json()
    except requests.RequestException as exc:
        logger.error("USGS: request failed — %s", exc)
        return []
    except ValueError as exc:
        logger.error("USGS: JSON parse failed — %s", exc)
        return []

    features = data.get("features", [])
    logger.info("USGS: received %d features", len(features))

    events = []
    for feature in features:
        try:
            feature_id = feature.get("id", "")
            props = feature.get("properties", {})
            coords = feature.get("geometry", {}).get("coordinates", [])

            if len(coords) < 2:
                logger.warning("USGS: skipping %s — missing coordinates", feature_id)
                continue

            lon, lat, depth = float(coords[0]), float(coords[1]), float(coords[2]) if len(coords) > 2 else 0.0
            mag = float(props.get("mag") or 0)
            time_ms = props.get("time")
            mag_type = props.get("magType") or "mb"

            status = "closed" if _is_closed(props) else "open"

            events.append({
                "id": f"USGS-{feature_id}",
                "external_id": feature_id,
                "source": "USGS",
                "category": "earthquake",
                "title": props.get("title") or f"M{mag} earthquake near {props.get('place', 'India')}",
                "description": (
                    f"Magnitude {mag} {mag_type} earthquake. "
                    f"Depth: {depth:.1f} km. "
                    f"Significance: {props.get('sig', 'N/A')}. "
                    f"Tsunami alert: {props.get('tsunami', 0)}."
                ),
                "severity": _severity(mag),
                "severity_value": mag,
                "severity_unit": mag_type,
                "status": status,
                "started_at": _ms_to_iso(time_ms) if time_ms else None,
                "closed_at": None,
                "latitude": lat,
                "longitude": lon,
                "place_name": props.get("place") or None,
                "geometry": {"type": "Point", "coordinates": [lon, lat, depth]},
                "source_url": props.get("url") or "https://earthquake.usgs.gov/",
                "raw": props,
                "created_at": None,
                "updated_at": None,
            })
        except Exception as exc:
            logger.warning("USGS: skipping feature due to error — %s | id=%s", exc, feature.get("id"))

    logger.info("USGS: transformed %d earthquake events", len(events))
    return events


if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO, format="%(levelname)s %(name)s: %(message)s")
    results = fetch()
    print(f"\nTotal events: {len(results)}")
    print("\nFirst 3 results:")
    for event in results[:3]:
        print({k: v for k, v in event.items() if k != "raw"})
