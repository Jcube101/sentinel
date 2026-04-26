import os
from dotenv import load_dotenv

load_dotenv()

SUPABASE_URL = os.getenv("SUPABASE_URL", "").strip().rstrip("/")
SUPABASE_SERVICE_KEY = os.getenv("SUPABASE_SERVICE_KEY", "").strip()
FIRMS_MAP_KEY = os.getenv("FIRMS_MAP_KEY")
OPENAQ_API_KEY = os.getenv("OPENAQ_API_KEY")

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