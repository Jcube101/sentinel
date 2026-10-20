"""Build data/india_districts.geojson: India's districts, each with its state.

One-off; rerun only to change the sources or the simplification. From pipeline/:

    B=https://github.com/wmgeolab/geoBoundaries/raw/9469f09/releaseData/gbOpen/IND
    curl -L -o /tmp/ind_adm2.geojson $B/ADM2/geoBoundaries-IND-ADM2_simplified.geojson
    curl -L -o /tmp/ind_adm1.geojson $B/ADM1/geoBoundaries-IND-ADM1_simplified.geojson
    .venv/bin/python tools/build_districts.py /tmp/ind_adm2.geojson /tmp/ind_adm1.geojson

The district file has no state field, so each district gets the state
whose polygon contains a point inside the district (nearest state for the
few coastal slivers outside every state polygon). Names are stored without
diacritics ("Bihār" -> "Bihar"). Licences: data/README.md.
"""
import json
import sys
import unicodedata
from collections import Counter
from pathlib import Path

from shapely import STRtree
from shapely.geometry import mapping, shape

OUT = Path(__file__).resolve().parent.parent / "data" / "india_districts.geojson"
TOLERANCE_DEG = 0.003  # ~300 m
PRECISION = 4

# Source quirks. "DATA NOT AVAILABLE" is the unnamed Gilgit-Baltistan / PoK
# polygon (inside India's official boundary, filed under Ladakh by ADM1).
NAME_FIXES = {
    "Hydrabad": "Hyderabad",
    "Leh(Ladakh)": "Leh",
    "Kadapa(YSR)": "Kadapa (YSR)",
    "DATA NOT AVAILABLE": "Gilgit-Baltistan / PoK",
}


def ascii_name(name: str) -> str:
    decomposed = unicodedata.normalize("NFKD", name)
    plain = " ".join("".join(ch for ch in decomposed if not unicodedata.combining(ch)).split())
    return NAME_FIXES.get(plain, plain)


def _round(obj):
    if isinstance(obj, (list, tuple)):
        if obj and isinstance(obj[0], (int, float)):
            return [round(obj[0], PRECISION), round(obj[1], PRECISION)]
        return [_round(o) for o in obj]
    return obj


def main(adm2_path: str, adm1_path: str) -> None:
    districts = json.load(open(adm2_path))["features"]
    states = json.load(open(adm1_path))["features"]
    state_geoms = [shape(f["geometry"]).buffer(0) for f in states]
    state_names = [ascii_name(f["properties"]["shapeName"]) for f in states]
    tree = STRtree(state_geoms)

    features, nearest_used = [], []
    for f in districts:
        geom = shape(f["geometry"]).buffer(0)
        point = geom.point_on_surface()
        hits = tree.query(point, predicate="within")
        if len(hits):
            state = state_names[int(hits[0])]
        else:
            state = state_names[int(tree.nearest(point))]
            nearest_used.append(f["properties"]["shapeName"])
        simple = geom.simplify(TOLERANCE_DEG, preserve_topology=True)
        geometry = mapping(simple)
        geometry["coordinates"] = _round(geometry["coordinates"])
        features.append({
            "type": "Feature",
            "properties": {"id": f["properties"]["shapeID"],
                           "name": ascii_name(f["properties"]["shapeName"]),
                           "state": state},
            "geometry": geometry,
        })

    OUT.write_text(json.dumps({
        "type": "FeatureCollection",
        "properties": {"source": "geoBoundaries gbOpen IND ADM2 + ADM1 (commit 9469f09)",
                       "licenses": ["ODbL-1.0 (ADM2)", "CC-BY-2.5-IN (ADM1)"],
                       "simplify_tolerance_deg": TOLERANCE_DEG},
        "features": features,
    }, separators=(",", ":")))
    per_state = Counter(f["properties"]["state"] for f in features)
    print(f"wrote {OUT} ({OUT.stat().st_size / 1e6:.1f} MB, {len(features)} districts, {len(per_state)} states)")
    print("nearest-state fallback:", nearest_used or "none")
    print(dict(sorted(per_state.items())))


if __name__ == "__main__":
    main(sys.argv[1], sys.argv[2])
