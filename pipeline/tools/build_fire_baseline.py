"""Build the static heat-source mask and the seasonal fire baseline.

Step 5 of docs/severity-pipeline.md. Reads the archive chunks pulled by
tools/pull_firms_archive.py. From pipeline/:

    PYTHONPATH=. .venv/bin/python tools/build_fire_baseline.py \\
        --cache-dir /home/jcube/projects/sentinel-data/firms_sp [--upload]
    PYTHONPATH=. .venv/bin/python tools/build_fire_baseline.py --upload-only

Writes data/static_heat_cells.json (typed + persistent cells, minus data/static_mask_exclusions.toml)
and data/fire_baseline.csv; with
--upload also upserts the baseline into the fire_baseline table
(migration 004). --upload-only sends the existing data/fire_baseline.csv
without rebuilding. Parameters: severity.toml [fire.static_mask], [fire.baseline].
"""
import argparse
import json
import logging
import sys
import time
from collections import defaultdict
from datetime import date, datetime, timedelta, timezone
from pathlib import Path

import baseline
import fire
from severity_config import load as load_config

logger = logging.getLogger("build_fire_baseline")


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--cache-dir", type=Path)
    parser.add_argument("--upload", action="store_true", help="upsert the baseline into Supabase fire_baseline")
    parser.add_argument("--upload-only", action="store_true", help="upload data/fire_baseline.csv as it is")
    args = parser.parse_args()
    if not args.upload_only and args.cache_dir is None:
        parser.error("--cache-dir is required unless --upload-only")
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s", datefmt="%H:%M:%S")
    for name in ("httpx", "urllib3"):
        logging.getLogger(name).setLevel(logging.WARNING)

    if args.upload_only:
        rows = [{k: r[k] for k in baseline.COLUMNS} for r in baseline.load().values()]
        upload(rows)
        return 0

    cfg = load_config()
    mask_cfg, base_cfg = cfg["fire"]["static_mask"], cfg["fire"]["baseline"]
    years = sorted(base_cfg["years"])
    start, end = date(years[0], 1, 1), date(years[-1], 12, 31)
    chunks = sorted(p for p in args.cache_dir.glob("*.csv.gz")
                    if start <= date.fromisoformat(p.name[:10]) <= end)
    logger.info("%d archive chunks for %s..%s", len(chunks), start, end)
    t0 = time.monotonic()

    # Pass 1: static heat-source cells. Two rules: SP labelled the detection static (type 1/2/3, at
    # least min_detections times), or the cell recurs (persistent_days days in each of persistent_years
    # separate years, any type). Year by year, keeping only the cells that reach persistent_days.
    keep = set(cfg["fire"]["confidence"])
    counts = defaultdict(int)
    covered = set()
    days_per_year = {}
    by_year = defaultdict(list)
    for path in chunks:
        by_year[int(path.name[:4])].append(path)
    for year, paths in sorted(by_year.items()):
        days = defaultdict(set)
        for path in paths:
            rows = baseline.read_chunk(path)
            baseline.count_static_cells(rows, set(mask_cfg["mask_types"]), mask_cfg["cell_deg"], counts)
            baseline.count_days_by_cell(rows, keep, mask_cfg["cell_deg"], days)
            covered.update(r["acq_date"] for r in rows)
        days_per_year[year] = {c: len(d) for c, d in days.items() if len(d) >= mask_cfg["persistent_days"]}
        logger.info("%d: %d cells with %d+ detection days", year, len(days_per_year[year]), mask_cfg["persistent_days"])
        del days
    type_cells = baseline.mask_cells(counts, mask_cfg["min_detections"])
    persistent = baseline.persistent_cells(days_per_year, mask_cfg["persistent_days"], mask_cfg["persistent_years"])
    persistent_new = persistent - type_cells
    exclusions = baseline.load_exclusions(fire.STATIC_MASK_EXCLUSIONS_PATH)
    persistent_kept, excluded = baseline.apply_exclusions(persistent_new, exclusions, mask_cfg["cell_deg"])
    cells = type_cells | persistent_kept
    for e in exclusions:
        logger.info("excluded site %s: %d persistent cell(s) left unmasked", e["name"], len(excluded.get(e["name"], [])))
    expected_days = (end - start).days + 1
    missing = sorted(set((start + timedelta(days=i)).isoformat()
                         for i in range(expected_days)) - covered)
    logger.info("static mask: %d cells = %d typed (of %d with any type %s detection) + %d persistent (%d+ days in "
                "%d+ years; %d more excluded by hand); archive has rows on %d of %d days%s",
                len(cells), len(type_cells), len(counts), mask_cfg["mask_types"], len(persistent_kept),
                mask_cfg["persistent_days"], mask_cfg["persistent_years"], sum(len(v) for v in excluded.values()),
                len(covered), expected_days,
                f" (missing, left out of the norms: {', '.join(missing)})" if missing else "")
    fire.STATIC_MASK_PATH.write_text(json.dumps({
        "cell_deg": mask_cfg["cell_deg"],
        "mask_types": mask_cfg["mask_types"],
        "min_detections": mask_cfg["min_detections"],
        "persistent_days": mask_cfg["persistent_days"],
        "persistent_years": mask_cfg["persistent_years"],
        "type_cells": len(type_cells),
        "persistent_cells": len(persistent_kept),
        "excluded_sites": {name: len(c) for name, c in sorted(excluded.items())},
        "source": f"FIRMS VIIRS_NOAA20_SP {start}..{end}",
        "built_at": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        "cells": sorted([list(c) for c in cells]),
    }, separators=(",", ":")))
    mask = fire.StaticMask(cells, mask_cfg["cell_deg"], mask_cfg["neighbour_cells"])
    for e in exclusions:
        logger.info("check %s (%s, %s): masked now? %s", e["name"], e["lat"], e["lon"], mask.masks(e["lat"], e["lon"]))

    # Pass 2: daily fire events per state, counted like live fire_events.
    districts = fire.Districts.india()
    daily = {}
    vegetation = masked = 0
    for path in chunks:
        by_day = defaultdict(list)
        for row in baseline.read_chunk(path):
            if baseline.firms_type(row) != 0:
                continue
            spot = baseline.to_hotspot(row)
            if spot is None or spot.confidence not in keep:
                continue
            vegetation += 1
            masked += mask.masks(spot.lat, spot.lon)
            by_day[spot.acq_date].append(spot)
        for day, spots in by_day.items():
            for state, value in baseline.count_day(spots, cfg, districts, mask).items():
                daily[(state, date.fromisoformat(day))] = value
    logger.info("%d nominal/high vegetation hotspots, %d (%.1f%%) inside the mask; %.1f min",
                vegetation, masked, 100 * masked / max(vegetation, 1), (time.monotonic() - t0) / 60)

    states = sorted({p["state"] for p in districts.props})
    rows = baseline.aggregate(daily, states, start, end, base_cfg["smooth_weeks"], f"{years[0]}-{years[-1]}",
                              covered={date.fromisoformat(d) for d in covered})
    baseline.write_csv(rows)
    logger.info("wrote %s: %d rows (%d states + India, 52 weeks)", baseline.BASELINE_PATH, len(rows), len(states))

    if args.upload:
        upload(rows)
    return 0


def upload(rows: list[dict]) -> None:
    from supabase import create_client
    from config import SUPABASE_SERVICE_KEY, SUPABASE_URL
    sb = create_client(SUPABASE_URL, SUPABASE_SERVICE_KEY)
    built = datetime.fromtimestamp(baseline.BASELINE_PATH.stat().st_mtime, timezone.utc).isoformat()
    payload = [{**r, "built_at": built} for r in rows]
    for i in range(0, len(payload), 500):
        sb.table("fire_baseline").upsert(payload[i:i + 500], on_conflict="state,week").execute()
    logger.info("uploaded %d rows to fire_baseline (built %s)", len(payload), built)


if __name__ == "__main__":
    sys.exit(main())
