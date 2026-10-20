"""India outline lookups for the severity desk."""
import json
import math
from functools import lru_cache
from pathlib import Path

import shapely
from shapely.geometry import Point, shape

OUTLINE_PATH = Path(__file__).resolve().parent / "data" / "india_outline.geojson"
EARTH_RADIUS_KM = 6371.0
_KM_PER_DEG = math.pi / 180 * EARTH_RADIUS_KM


@lru_cache(maxsize=1)
def india_outline():
    with open(OUTLINE_PATH) as f:
        geom = shape(json.load(f)["features"][0]["geometry"])
    shapely.prepare(geom)
    return geom


def km_from(outline, lat: float, lon: float) -> float:
    """0 inside outline, else km from (lat, lon) to its nearest point."""
    point = Point(lon, lat)
    if outline.contains(point):
        return 0.0
    # Equirectangular projection centred on the point: within ~1% at a few
    # hundred km, plenty for a 100 km scope check.
    k = math.cos(math.radians(lat))

    def to_local_km(coords):
        out = coords.copy()
        out[:, 0] = (coords[:, 0] - lon) * k * _KM_PER_DEG
        out[:, 1] = (coords[:, 1] - lat) * _KM_PER_DEG
        return out

    return float(shapely.distance(shapely.transform(outline, to_local_km), Point(0, 0)))


def km_from_india(lat: float, lon: float) -> float:
    return km_from(india_outline(), lat, lon)
