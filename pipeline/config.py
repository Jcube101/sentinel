import os
from dotenv import load_dotenv

load_dotenv()

SUPABASE_URL = os.getenv("SUPABASE_URL", "").strip().rstrip("/")
SUPABASE_SERVICE_KEY = os.getenv("SUPABASE_SERVICE_KEY", "").strip()
FIRMS_MAP_KEY = os.getenv("FIRMS_MAP_KEY")
OPENAQ_API_KEY = os.getenv("OPENAQ_API_KEY")
# data.gov.in key for CPCB's real-time AQI feed (datagov.py), the primary
# source for the air:IN desk item; without it the item uses OpenAQ.
DATA_GOV_IN_API_KEY = (os.getenv("DATA_GOV_IN_API_KEY") or "").strip() or None

# Days an event stays in Supabase, by started_at, before pipeline._cleanup()
# deletes it (the local SQLite archive keeps it). Fetchers that can return
# older rows skip them, so they aren't written only to be deleted again.
SHORT_RETENTION_DAYS = 60   # FIRMS, GDACS
LONG_RETENTION_DAYS = 365   # EONET, USGS

# Read timeout (s) per GDACS request; other fetchers keep fetchers.http's 30 s.
# GDACS's search is slow to answer a query it hasn't cached. A page usually
# took 8-15 s, but in 11 of 14 runs (23-27 Oct 2026) a request ran past 30 s,
# often the run's first, while the retry came back in seconds. In 5 runs every
# try timed out and the run had no GDACS data. 90 s lets a slow first request
# finish. With GDACS down, its 3 tries now take ~5 min instead of ~2.
GDACS_READ_TIMEOUT_S = 90

# India bounding box
INDIA_BBOX = {
    "west": 68.7,
    "south": 8.4,
    "east": 97.4,
    "north": 37.1
}

# FIRMS format: west,south,east,north
INDIA_BBOX_FIRMS = "68.7,8.4,97.4,37.1"

# USGS format: minlat, maxlat, minlon, maxlon
INDIA_BBOX_USGS = {
    "minlatitude": 8.4,
    "maxlatitude": 37.1,
    "minlongitude": 68.7,
    "maxlongitude": 97.4
}