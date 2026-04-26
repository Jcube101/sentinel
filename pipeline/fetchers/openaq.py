import logging
import time
from datetime import datetime, timedelta, timezone

import requests
from dateutil import parser as dateutil_parser

from config import INDIA_BBOX, OPENAQ_API_KEY

logger = logging.getLogger(__name__)

LOCATIONS_ENDPOINT = "https://api.openaq.org/v3/locations"
SENSORS_ENDPOINT = "https://api.openaq.org/v3/locations/{location_id}/sensors"
WANTED_PARAMS = {"pm25", "pm10", "no2", "so2", "o3"}
CUTOFF_HOURS = 24


def _headers() -> dict:
    return {"X-API-Key": OPENAQ_API_KEY}


def _in_india(lat: float, lon: float) -> bool:
    return (
        INDIA_BBOX["south"] <= lat <= INDIA_BBOX["north"]
        and INDIA_BBOX["west"] <= lon <= INDIA_BBOX["east"]
    )


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


def _is_fresh(recorded_at: str | None) -> bool:
    if not recorded_at:
        return False
    try:
        dt = dateutil_parser.parse(recorded_at)
        if dt.tzinfo is None:
            dt = dt.replace(tzinfo=timezone.utc)
        cutoff = datetime.now(tz=timezone.utc) - timedelta(hours=CUTOFF_HOURS)
        return dt >= cutoff
    except Exception:
        return False


def _fetch_locations() -> list[dict]:
    try:
        resp = requests.get(
            LOCATIONS_ENDPOINT,
            headers=_headers(),
            params={"countries_id": 9, "limit": 50, "page": 1},
            timeout=30,
        )
        resp.raise_for_status()
        return resp.json().get("results", [])
    except requests.RequestException as exc:
        logger.error("OpenAQ: failed to fetch locations — %s", exc)
        return []


def _fetch_sensors(location_id: int) -> list[dict]:
    try:
        resp = requests.get(
            SENSORS_ENDPOINT.format(location_id=location_id),
            headers=_headers(),
            timeout=30,
        )
        resp.raise_for_status()
        return resp.json().get("results", [])
    except requests.RequestException as exc:
        logger.warning("OpenAQ: failed to fetch sensors for location %s — %s", location_id, exc)
        return []


def fetch() -> list[dict]:
    logger.info("OpenAQ: fetching locations (country=IN, limit=50)")
    locations = _fetch_locations()
    logger.info("OpenAQ: received %d locations", len(locations))

    readings = []
    skipped_bbox = 0

    for loc in locations:
        try:
            loc_id = loc.get("id")
            loc_name = loc.get("name", "")
            city = loc.get("locality") or None
            coords = loc.get("coordinates") or {}
            lat = coords.get("latitude")
            lon = coords.get("longitude")

            if lat is None or lon is None:
                continue
            lat, lon = float(lat), float(lon)

            if not _in_india(lat, lon):
                skipped_bbox += 1
                continue

            sensors = _fetch_sensors(loc_id)
            time.sleep(0.5)

            for sensor in sensors:
                param = (sensor.get("parameter", {}).get("name") or "").lower()
                if param not in WANTED_PARAMS:
                    continue

                latest = sensor.get("latest") or {}
                value = latest.get("value")
                if value is None or float(value) < 0:
                    continue

                recorded_at = (latest.get("datetime") or {}).get("utc")
                if not _is_fresh(recorded_at):
                    continue

                unit = sensor.get("parameter", {}).get("units") or "µg/m³"

                readings.append({
                    "location_id": str(loc_id),
                    "location_name": loc_name,
                    "city": city,
                    "latitude": lat,
                    "longitude": lon,
                    "parameter": param,
                    "value": float(value),
                    "unit": unit,
                    "recorded_at": _parse_dt(recorded_at),
                })

        except Exception as exc:
            logger.warning("OpenAQ: error processing location %s — %s", loc.get("id"), exc)

    if skipped_bbox:
        logger.info("OpenAQ: skipped %d locations outside India bbox", skipped_bbox)
    logger.info("OpenAQ: returning %d aqi readings", len(readings))
    return readings


if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO, format="%(levelname)s %(name)s: %(message)s")
    results = fetch()
    print(f"\nTotal readings: {len(results)}")
    print("\nFirst 3 results:")
    for r in results[:3]:
        print(r)
