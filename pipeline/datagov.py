"""CPCB's real-time AQI feed on data.gov.in: the primary source for air:IN.

Dataset "Real time Air Quality Index from various locations" (resource
3b01bcb8-0b14-4abf-b6f2-c1bfd384ba69, published by CPCB), refreshed hourly.
One row per station and pollutant (PM2.5, PM10, NO2, SO2, CO, OZONE, NH3):
station in CPCB's "Site, City - Agency" form, city, state, latitude,
longitude, last_update (the snapshot hour, IST, the same for every station)
and min / max / avg.

The values are CPCB's AQI sub-indices (0-500), not concentrations: CO reads
up to ~170 and PM2.5 often exceeds PM10. avg_value is the sub-index CPCB's
AQI uses (24 h averages; 8 h for CO and ozone). CPCB's method: a station's
AQI is its highest sub-index, computed only with at least 3 pollutants, one
of them PM2.5 or PM10; a city's AQI is the mean of its stations. Done that
way, the feed reproduced CPCB's 4 PM city bulletin for 96% of cities on
21 Oct 2026. The data is live and unvalidated (CPCB's note on the dataset).

API quirk: requests with Python's default User-Agent ("python-requests/...")
hang for 60 s and get HTTP 502, so every request sends USER_AGENT.
"""
import logging
import time
from collections import Counter
from datetime import datetime
from zoneinfo import ZoneInfo

import requests

import runs

logger = logging.getLogger(__name__)

API_URL = "https://api.data.gov.in/resource/3b01bcb8-0b14-4abf-b6f2-c1bfd384ba69"
DATASET_URL = "https://data.gov.in/resource/real-time-air-quality-index-various-locations"
USER_AGENT = "Sentinel-pipeline/1.0 (+https://github.com/Jcube101/sentinel)"
SOURCE_ID = "DATAGOV"        # sources.id (migration 006)
PAGE_SIZE = 1000             # ~3,700 rows in Oct 2026: 4 requests
MAX_PAGES = 10
TIMEOUT_S = 60
RETRIES = 3
PM = ("PM2.5", "PM10")
IST = ZoneInfo("Asia/Kolkata")


class FeedError(RuntimeError):
    """The feed could not be read. The message never contains the API key.

    status: sources.last_status for the attempt (error | timeout | empty).
    """

    def __init__(self, message: str, status: str = "error"):
        super().__init__(runs.redact(message))
        self.status = status


# --- fetching -------------------------------------------------------------------------

def fetch(key: str | None, *, get=None, sleep=time.sleep) -> tuple[list[dict], int]:
    """Every record in the feed. Returns (records, requests made)."""
    if not key:
        raise FeedError("no DATA_GOV_IN_API_KEY set")
    get = get or requests.get  # looked up per call, so tests can block it
    records, total, requests_made = [], None, 0
    for _ in range(MAX_PAGES):
        body, made = _page(key, len(records), get, sleep)
        requests_made += made
        page = body.get("records") or []
        total = int(body.get("total") or 0)
        records += page
        if not page or len(records) >= total:
            break
    else:
        logger.warning("data.gov.in: stopped after %d pages, %d of %s records", MAX_PAGES, len(records), total)
    if not records:
        raise FeedError("feed returned no records", status="empty")
    return records, requests_made


def _page(key: str, offset: int, get, sleep) -> tuple[dict, int]:
    params = {"api-key": key, "format": "json", "limit": PAGE_SIZE, "offset": offset}
    problem, status = "no response", "error"
    for attempt in range(RETRIES):
        try:
            resp = get(API_URL, params=params, headers={"User-Agent": USER_AGENT}, timeout=TIMEOUT_S)
        except requests.Timeout:
            problem, status = f"timed out after {TIMEOUT_S} s", "timeout"
        except requests.RequestException as exc:
            problem, status = type(exc).__name__, "error"   # never str(exc): it holds the URL and key
        else:
            if resp.status_code == 200:
                try:
                    body = resp.json()
                except ValueError:
                    body = None
                if isinstance(body, dict) and "records" in body:
                    return body, attempt + 1
                problem, status = "response was not a record list", "error"
            elif resp.status_code in (429, 500, 502, 503, 504):
                problem, status = f"HTTP {resp.status_code}", "timeout" if resp.status_code == 504 else "error"
            else:  # 401/403 (bad key) and other client errors: retrying won't help
                raise FeedError(f"HTTP {resp.status_code}: {resp.text[:120]}")
        if attempt < RETRIES - 1:
            sleep(5 * (attempt + 1))
    raise FeedError(f"{problem} ({RETRIES} tries, offset {offset})", status=status)


# --- parsing --------------------------------------------------------------------------

def _number(value) -> float | None:
    try:
        return float(value)
    except (TypeError, ValueError):   # "NA", "", None
        return None


def parse_time(value) -> datetime | None:
    """last_update, e.g. "21-10-2026 19:00:00" (IST)."""
    try:
        return datetime.strptime(str(value).strip(), "%d-%m-%Y %H:%M:%S").replace(tzinfo=IST)
    except ValueError:
        return None


def stations(records: list[dict]) -> dict[str, dict]:
    """Station name -> {city, state, latitude, longitude, updated, sub_indices: {pollutant: avg}}."""
    out = {}
    for r in records:
        name = (r.get("station") or "").strip()
        if not name:
            continue
        st = out.setdefault(name, {
            "city": (r.get("city") or "").strip() or None, "state": (r.get("state") or "").strip() or None,
            "latitude": _number(r.get("latitude")), "longitude": _number(r.get("longitude")),
            "updated": None, "sub_indices": {},
        })
        updated = parse_time(r.get("last_update"))
        if updated and (st["updated"] is None or updated > st["updated"]):
            st["updated"] = updated
        value = _number(r.get("avg_value"))
        pollutant = (r.get("pollutant_id") or "").strip()
        if pollutant and value is not None and value >= 0:
            st["sub_indices"][pollutant] = value
    return out


def station_aqi(sub_indices: dict[str, float], min_pollutants: int) -> tuple[int | None, list[str]]:
    """CPCB: the highest sub-index, if at least min_pollutants pollutants
    report and one of them is PM2.5 or PM10. Returns (AQI, prominent pollutants)."""
    if len(sub_indices) < min_pollutants or not any(p in sub_indices for p in PM):
        return None, []
    top = max(sub_indices.values())
    return round(top), sorted(p for p, v in sub_indices.items() if v == top)


def prominent(per_station: list[list[str]]) -> list[str]:
    """A city's prominent pollutant(s): the one(s) most often prominent at its stations."""
    counts = Counter(p for ps in per_station for p in ps)
    if not counts:
        return []
    most = max(counts.values())
    return sorted(p for p, n in counts.items() if n == most)
