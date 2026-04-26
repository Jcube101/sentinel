import logging
from datetime import timezone

import requests
from dateutil import parser as dateutil_parser

from config import INDIA_BBOX

logger = logging.getLogger(__name__)

ENDPOINT = "https://eonet.gsfc.nasa.gov/api/v3/events"
_BASE_PARAMS = {
    "status": "all",
    "category": "wildfires,severeStorms",
    "bbox": "68.7,8.4,97.4,37.1",
}

CATEGORY_MAP = {
    "wildfires": "fire",
    "severeStorms": "cyclone",
}


def _map_category(eonet_categories: list) -> str:
    for cat in eonet_categories:
        slug = cat.get("id", "")
        if slug in CATEGORY_MAP:
            return CATEGORY_MAP[slug]
    return "fire"


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


def _most_recent_geometry(geometries: list) -> dict | None:
    """Return the geometry entry with the latest date."""
    dated = [g for g in geometries if g.get("date")]
    if not dated:
        return geometries[-1] if geometries else None
    return max(dated, key=lambda g: g["date"])


def _severity(geometries: list) -> tuple[str, float | None, str | None]:
    """Return (severity_label, severity_value, severity_unit) from geometry magnitudeValue."""
    for g in reversed(geometries):
        mag = g.get("magnitudeValue")
        unit = g.get("magnitudeUnit") or None
        if mag is not None:
            try:
                mag = float(mag)
                # Map magnitude to severity — EONET units vary (kts for storms, acres for fires)
                # Use a simple absolute threshold on the raw value as a best-effort proxy
                if mag > 100:
                    label = "extreme"
                elif mag > 50:
                    label = "high"
                elif mag > 10:
                    label = "medium"
                else:
                    label = "low"
                return label, mag, unit
            except (TypeError, ValueError):
                pass
    return "medium", None, None


def fetch(start_date: str | None = None, end_date: str | None = None) -> list[dict]:
    if start_date and end_date:
        params = {**_BASE_PARAMS, "start": start_date, "end": end_date}
        logger.info("EONET: fetching events %s to %s", start_date, end_date)
    else:
        params = {**_BASE_PARAMS, "days": 30}
        logger.info("EONET: fetching events (last 30 days)")

    try:
        resp = requests.get(ENDPOINT, params=params, timeout=30)
        resp.raise_for_status()
        data = resp.json()
    except requests.RequestException as exc:
        logger.error("EONET: request failed — %s", exc)
        return []
    except ValueError as exc:
        logger.error("EONET: JSON parse failed — %s", exc)
        return []

    raw_events = data.get("events", [])
    logger.info("EONET: received %d raw events", len(raw_events))

    events = []
    for raw in raw_events:
        try:
            eonet_id = raw["id"]
            geometries = raw.get("geometry", [])

            recent = _most_recent_geometry(geometries)
            if recent is None:
                logger.warning("EONET: skipping %s — no geometry", eonet_id)
                continue

            coords = recent.get("coordinates", [])
            # Point: [lon, lat] — Polygon/Track: nested, take first point
            if recent.get("type") == "Point":
                lon, lat = float(coords[0]), float(coords[1])
            else:
                lon, lat = float(coords[0][0]), float(coords[0][1])

            category = _map_category(raw.get("categories", []))
            severity_label, severity_value, severity_unit = _severity(geometries)

            closed_at_raw = raw.get("closed")
            status = "closed" if closed_at_raw else "open"

            # started_at: date of earliest geometry point
            dated = [g for g in geometries if g.get("date")]
            started_at_raw = min(dated, key=lambda g: g["date"])["date"] if dated else None

            full_geometry = {
                "type": "GeometryCollection",
                "geometries": [
                    {
                        "type": g.get("type"),
                        "coordinates": g.get("coordinates"),
                        "date": g.get("date"),
                        "magnitudeValue": g.get("magnitudeValue"),
                        "magnitudeUnit": g.get("magnitudeUnit"),
                    }
                    for g in geometries
                ],
            }

            events.append({
                "id": f"EONET-{eonet_id}",
                "external_id": eonet_id,
                "source": "EONET",
                "category": category,
                "title": raw.get("title", ""),
                "description": (
                    f"NASA EONET event. "
                    f"Categories: {', '.join(c.get('title','') for c in raw.get('categories',[]))}. "
                    f"Geometry points: {len(geometries)}."
                ),
                "severity": severity_label,
                "severity_value": severity_value,
                "severity_unit": severity_unit,
                "status": status,
                "started_at": _parse_dt(started_at_raw),
                "closed_at": _parse_dt(closed_at_raw),
                "latitude": lat,
                "longitude": lon,
                "place_name": None,
                "geometry": full_geometry,
                "source_url": raw.get("link") or "https://eonet.gsfc.nasa.gov/",
                "raw": raw,
                "created_at": None,
                "updated_at": None,
            })
        except Exception as exc:
            logger.warning("EONET: skipping event due to error — %s | id=%s", exc, raw.get("id"))

    logger.info("EONET: transformed %d events", len(events))
    return events


if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO, format="%(levelname)s %(name)s: %(message)s")
    results = fetch()
    print(f"\nTotal events: {len(results)}")
    print("\nFirst 3 results:")
    for event in results[:3]:
        print({k: v for k, v in event.items() if k != "raw"})
