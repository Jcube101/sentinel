import csv
import io
import logging
from datetime import datetime, timezone

import requests

from config import FIRMS_MAP_KEY, INDIA_BBOX_FIRMS

logger = logging.getLogger(__name__)

ENDPOINT = (
    "https://firms.modaps.eosdis.nasa.gov/api/area/csv"
    "/{key}/VIIRS_NOAA20_NRT/{bbox}/1"
)
# Backfill endpoint: product is NRT (last ~10 days) or SP (standard, months of history)
ENDPOINT_DATE = (
    "https://firms.modaps.eosdis.nasa.gov/api/area/csv"
    "/{key}/{product}/{bbox}/{day_range}/{date}"
)


def _severity(frp: float) -> str:
    if frp > 100:
        return "extreme"
    if frp > 50:
        return "high"
    if frp > 10:
        return "medium"
    return "low"


def _parse_datetime(acq_date: str, acq_time: str) -> str:
    """Return ISO 8601 UTC string from FIRMS acq_date (YYYY-MM-DD) and acq_time (HHMM)."""
    acq_time = acq_time.zfill(4)
    dt = datetime.strptime(f"{acq_date} {acq_time}", "%Y-%m-%d %H%M")
    return dt.replace(tzinfo=timezone.utc).isoformat()


def _fetch_url(url: str) -> list[dict]:
    """Fetch and parse one FIRMS CSV URL into event dicts."""
    try:
        resp = requests.get(url, timeout=30)
        resp.raise_for_status()
    except requests.RequestException as exc:
        logger.error("FIRMS: request failed — %s", exc)
        return []

    try:
        reader = csv.DictReader(io.StringIO(resp.text))
        rows = list(reader)
    except Exception as exc:
        logger.error("FIRMS: CSV parse failed — %s", exc)
        return []

    events = []
    for row in rows:
        try:
            lat = float(row["latitude"])
            lon = float(row["longitude"])
            acq_date = row["acq_date"]
            acq_time = row["acq_time"]
            frp = float(row.get("frp") or 0)

            event_id = f"FIRMS-{lat}-{lon}-{acq_date}-{acq_time}"
            started_at = _parse_datetime(acq_date, acq_time)

            events.append({
                "id": event_id,
                "external_id": event_id,
                "source": "FIRMS",
                "category": "fire",
                "title": f"Fire hotspot at ({lat:.4f}, {lon:.4f})",
                "description": (
                    f"VIIRS NOAA-20 fire hotspot. "
                    f"Brightness: {row.get('bright_ti4', 'N/A')} K, "
                    f"FRP: {frp} MW, "
                    f"Confidence: {row.get('confidence', 'N/A')}."
                ),
                "severity": _severity(frp),
                "severity_value": frp,
                "severity_unit": "MW",
                "status": "open",
                "started_at": started_at,
                "closed_at": None,
                "latitude": lat,
                "longitude": lon,
                "place_name": None,
                "geometry": {"type": "Point", "coordinates": [lon, lat]},
                "source_url": "https://firms.modaps.eosdis.nasa.gov/",
                "raw": dict(row),
                "created_at": None,
                "updated_at": None,
            })
        except Exception as exc:
            logger.warning("FIRMS: skipping row due to error — %s | row=%s", exc, row)

    return events


def fetch(start_date: str | None = None, end_date: str | None = None) -> list[dict]:
    """Fetch fire hotspot events.

    With no arguments fetches the last 1 day (pipeline mode).
    With start_date/end_date, backfill.py drives chunked calls directly
    via fetch_range() — this signature accepts them for interface consistency
    but ignores them in favour of the default 1-day window.
    """
    url = ENDPOINT.format(key=FIRMS_MAP_KEY, bbox=INDIA_BBOX_FIRMS)
    logger.info("FIRMS: fetching from %s", url)

    events = _fetch_url(url)
    logger.info("FIRMS: fetched %d fire hotspot events", len(events))
    return events


def fetch_range(start_date: datetime, end_date: datetime, chunk_days: int = 5) -> list[dict]:
    """Fetch FIRMS data over a date range in chunk_days-sized windows.

    Uses VIIRS_NOAA20_NRT for chunks within the last 10 days (only source
    available for recent data) and VIIRS_NOAA20_SP for older chunks (NRT
    only retains ~10 days; SP has months of history).
    """
    from datetime import timedelta
    import time as _time

    ten_days_ago = (datetime.utcnow() - timedelta(days=10)).date()

    total_days = (end_date - start_date).days
    num_chunks = max(1, (total_days + chunk_days - 1) // chunk_days)
    all_events: list[dict] = []

    chunk_start = start_date
    chunk_num = 0
    while chunk_start < end_date:
        chunk_num += 1
        chunk_end = min(chunk_start + timedelta(days=chunk_days), end_date)
        actual_days = (chunk_end - chunk_start).days or 1
        date_str = chunk_start.strftime("%Y-%m-%d")

        product = "VIIRS_NOAA20_NRT" if chunk_start.date() >= ten_days_ago else "VIIRS_NOAA20_SP"
        logger.info(
            "FIRMS: fetching chunk %d/%d (%s, %d days) via %s",
            chunk_num, num_chunks, date_str, actual_days, product,
        )
        url = ENDPOINT_DATE.format(
            key=FIRMS_MAP_KEY,
            product=product,
            bbox=INDIA_BBOX_FIRMS,
            day_range=actual_days,
            date=date_str,
        )
        chunk_events = _fetch_url(url)
        logger.info("FIRMS: chunk %d returned %d events", chunk_num, len(chunk_events))
        all_events.extend(chunk_events)

        chunk_start = chunk_end
        if chunk_start < end_date:
            _time.sleep(1)

    logger.info("FIRMS: fetch_range total %d events", len(all_events))
    return all_events


if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO, format="%(levelname)s %(name)s: %(message)s")
    results = fetch()
    print(f"\nTotal events: {len(results)}")
    print("\nFirst 3 results:")
    for event in results[:3]:
        print({k: v for k, v in event.items() if k != "raw"})
