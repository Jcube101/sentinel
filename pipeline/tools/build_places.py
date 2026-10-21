"""Build data/india_places.csv: populated places in India with population.

Input for the Level 4 fire rule (step 6 of docs/severity-pipeline.md): a
large fire within fire.level_4_near_km of a place with at least
fire.level_4_min_population people. From pipeline/:

    PYTHONPATH=. .venv/bin/python tools/build_places.py [--zip cities15000.zip]

Source: GeoNames cities15000 (every place with 15,000+ people), CC BY 4.0,
https://download.geonames.org/export/dump/. Without --zip it is downloaded
to a temporary directory. Kept: country IN, feature class P, minus
sections of a city (PPLX) and historical, abandoned or destroyed places.
"""
import argparse
import csv
import io
import logging
import sys
import tempfile
import zipfile
from pathlib import Path

import requests

import fire

logger = logging.getLogger("build_places")

URL = "https://download.geonames.org/export/dump/cities15000.zip"
PLACES_PATH = fire.DATA_DIR / "india_places.csv"
SKIP_CODES = {"PPLX", "PPLH", "PPLQ", "PPLW", "PPLCH"}
COLUMNS = ("geonameid", "name", "latitude", "longitude", "population", "feature_code")


def india_places(lines) -> list[dict]:
    """GeoNames dump lines (tab-separated, 19 columns) -> India's populated places."""
    out = []
    for line in lines:
        f = line.rstrip("\n").split("\t")
        if len(f) < 19 or f[8] != "IN" or f[6] != "P" or f[7] in SKIP_CODES:
            continue
        out.append({"geonameid": int(f[0]), "name": f[1], "latitude": float(f[4]), "longitude": float(f[5]),
                    "population": int(f[14] or 0), "feature_code": f[7]})
    out.sort(key=lambda p: (-p["population"], p["name"]))
    return out


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--zip", type=Path, help="a downloaded cities15000.zip")
    args = parser.parse_args()
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s", datefmt="%H:%M:%S")

    with tempfile.TemporaryDirectory() as tmp:
        path = args.zip
        if path is None:
            path = Path(tmp) / "cities15000.zip"
            resp = requests.get(URL, timeout=120)
            resp.raise_for_status()
            path.write_bytes(resp.content)
            logger.info("downloaded %s (%.1f MB)", URL, len(resp.content) / 1e6)
        with zipfile.ZipFile(path) as zf, zf.open("cities15000.txt") as raw:
            places = india_places(io.TextIOWrapper(raw, encoding="utf-8"))

    with open(PLACES_PATH, "w", newline="", encoding="utf-8") as f:
        writer = csv.DictWriter(f, fieldnames=COLUMNS)
        writer.writeheader()
        writer.writerows(places)
    big = sum(1 for p in places if p["population"] >= 100_000)
    logger.info("wrote %s: %d places (%d with 100,000+ people)", PLACES_PATH, len(places), big)
    return 0


if __name__ == "__main__":
    sys.exit(main())
