import os
from dotenv import load_dotenv

load_dotenv()

SUPABASE_URL = os.getenv("SUPABASE_URL", "").strip().rstrip("/")
SUPABASE_SERVICE_KEY = os.getenv("SUPABASE_SERVICE_KEY", "").strip()
FIRMS_MAP_KEY = os.getenv("FIRMS_MAP_KEY")
OPENAQ_API_KEY = os.getenv("OPENAQ_API_KEY")

# Days an event stays in Supabase, by started_at, before pipeline._cleanup()
# deletes it (the local SQLite archive keeps it). Fetchers that can return
# older rows skip them, so they aren't written only to be deleted again.
SHORT_RETENTION_DAYS = 60   # FIRMS, GDACS
LONG_RETENTION_DAYS = 365   # EONET, USGS

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