"""Build data/india_outline.geojson from the geoBoundaries India districts file.

One-off; rerun only to change the source or the simplification. From pipeline/:

    curl -L -o /tmp/ind_adm2.geojson \\
      https://github.com/wmgeolab/geoBoundaries/raw/9469f09/releaseData/gbOpen/IND/ADM2/geoBoundaries-IND-ADM2_simplified.geojson
    .venv/bin/python tools/build_india_outline.py /tmp/ind_adm2.geojson

Dissolves the 735 districts into one outline (holes dropped, every island
kept) and simplifies it to about 1 km, plenty for "within 100 km of India".
The source follows India's official boundary. Licence: ODbL 1.0, see
data/README.md.
"""
import json
import sys
from pathlib import Path

from shapely import union_all
from shapely.geometry import MultiPolygon, Polygon, mapping, shape

OUT = Path(__file__).resolve().parent.parent / "data" / "india_outline.geojson"
TOLERANCE_DEG = 0.01  # ~1 km
PRECISION = 4         # decimal places, ~11 m


def _round(coords):
    return [[round(x, PRECISION), round(y, PRECISION)] for x, y in coords]


def main(src: str) -> None:
    features = json.load(open(src))["features"]
    merged = union_all([shape(f["geometry"]).buffer(0) for f in features])
    parts = merged.geoms if isinstance(merged, MultiPolygon) else [merged]
    # Drop holes: India has none; gaps between simplified districts would
    # otherwise read as "outside India".
    filled = MultiPolygon([Polygon(p.exterior) for p in parts])
    simple = filled.simplify(TOLERANCE_DEG, preserve_topology=True)
    simple = simple if isinstance(simple, MultiPolygon) else MultiPolygon([simple])

    geometry = mapping(simple)
    geometry["coordinates"] = [[_round(ring) for ring in poly] for poly in geometry["coordinates"]]
    out = {
        "type": "FeatureCollection",
        "features": [{
            "type": "Feature",
            "properties": {
                "name": "India",
                "source": "geoBoundaries gbOpen IND ADM2 (commit 9469f09), dissolved",
                "license": "ODbL-1.0",
                "simplify_tolerance_deg": TOLERANCE_DEG,
                "district_count": len(features),
            },
            "geometry": geometry,
        }],
    }
    OUT.parent.mkdir(exist_ok=True)
    OUT.write_text(json.dumps(out, separators=(",", ":")))
    vertices = sum(len(p.exterior.coords) for p in simple.geoms)
    print(f"wrote {OUT} ({OUT.stat().st_size / 1024:.0f} KB, {len(simple.geoms)} parts, {vertices} vertices)")


if __name__ == "__main__":
    main(sys.argv[1])
