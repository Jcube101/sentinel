"""Fire events: FIRMS hotspots clustered per UTC day and placed in districts.

Step 4 of docs/severity-pipeline.md. Each run, for every acq_date in the
FIRMS window (today and yesterday, UTC):

  1. keep nominal and high-confidence hotspots (fire.confidence)
  2. drop hotspots on the static heat-source mask: steel plants,
     refineries, gas flares (data/static_heat_cells.json, built from the
     FIRMS archive in step 5; until it exists nothing is masked)
  3. single-linkage clusters: hotspots within fire.cluster_km of each
     other join one fire event
  4. district and state of each event's centroid; events outside India's
     districts, or in fire.excluded_district_ids, are dropped
  5. replace that day's rows in fire_events

Schema: migrations/003_fire_events.sql. Thresholds: severity.toml [fire].
"""
import json
import logging
import math
from collections import defaultdict
from dataclasses import dataclass
from datetime import date, datetime, timedelta, timezone
from functools import lru_cache
from pathlib import Path

import desk

logger = logging.getLogger(__name__)

TABLE = "fire_events"
BATCH_SIZE = 500
DATA_DIR = Path(__file__).resolve().parent / "data"
DISTRICTS_PATH = DATA_DIR / "india_districts.geojson"
STATIC_MASK_PATH = DATA_DIR / "static_heat_cells.json"
EARTH_RADIUS_KM = 6371.0
KM_PER_DEG_LAT = math.pi / 180 * EARTH_RADIUS_KM


@dataclass(frozen=True)
class Hotspot:
    id: str
    lat: float
    lon: float
    acq_date: str
    when: datetime
    frp: float
    confidence: str


def hotspots(rows: list[dict], cfg: dict) -> list[Hotspot]:
    """FIRMS event rows -> hotspots at the configured confidence levels."""
    keep = set(cfg["fire"]["confidence"])
    out = []
    for row in rows:
        raw = row.get("raw") or {}
        confidence = (raw.get("confidence") or "").strip().lower()
        when = desk._dt(row.get("started_at"))
        if confidence not in keep or when is None or not raw.get("acq_date"):
            continue
        try:
            frp = float(raw.get("frp") or row.get("severity_value") or 0)
            out.append(Hotspot(row["id"], float(row["latitude"]), float(row["longitude"]),
                               raw["acq_date"], when, frp, confidence))
        except (TypeError, ValueError, KeyError):
            continue
    return out


# --- static heat-source mask ----------------------------------------------------------

class StaticMask:
    """Grid cells known to hold static heat sources (not fires).

    File: {"cell_deg": 0.004, "cells": [[lat_index, lon_index], ...], ...}
    where lat_index = floor(lat / cell_deg). A hotspot is masked when its
    cell, or one within neighbour_cells of it, is listed.
    """

    def __init__(self, cells: set[tuple[int, int]], cell_deg: float, neighbour_cells: int):
        self.cells, self.cell_deg, self.reach = cells, cell_deg, neighbour_cells

    @classmethod
    def load(cls, path: Path, neighbour_cells: int) -> "StaticMask":
        if not path.exists():
            return cls(set(), 1.0, 0)
        with open(path) as f:
            data = json.load(f)
        return cls({tuple(c) for c in data["cells"]}, float(data["cell_deg"]), neighbour_cells)

    def __len__(self):
        return len(self.cells)

    def masks(self, lat: float, lon: float) -> bool:
        if not self.cells:
            return False
        i, j = math.floor(lat / self.cell_deg), math.floor(lon / self.cell_deg)
        r = self.reach
        return any((i + di, j + dj) in self.cells for di in range(-r, r + 1) for dj in range(-r, r + 1))


# --- clustering ------------------------------------------------------------------------------

def haversine_km(lat1, lon1, lat2, lon2) -> float:
    p1, p2 = math.radians(lat1), math.radians(lat2)
    h = (math.sin((p2 - p1) / 2) ** 2
         + math.cos(p1) * math.cos(p2) * math.sin(math.radians(lon2 - lon1) / 2) ** 2)
    return 2 * EARTH_RADIUS_KM * math.asin(math.sqrt(h))


def cluster(points: list[tuple[float, float]], km: float) -> list[list[int]]:
    """Single-linkage clusters (DBSCAN with min_samples=1): indices grouped.

    Grid hash + union-find. One longitude cell width for every point, sized
    for the highest latitude present, so a cell is at least `km` wide
    everywhere and neighbours are always within one cell.
    """
    if not points:
        return []
    lat_cell = km / KM_PER_DEG_LAT
    max_abs_lat = min(max(abs(lat) for lat, _ in points), 85.0)
    lon_cell = lat_cell / math.cos(math.radians(max_abs_lat))
    grid = defaultdict(list)
    for idx, (lat, lon) in enumerate(points):
        grid[(math.floor(lat / lat_cell), math.floor(lon / lon_cell))].append(idx)

    parent = list(range(len(points)))

    def find(x):
        while parent[x] != x:
            parent[x] = parent[parent[x]]
            x = parent[x]
        return x

    for (gi, gj), members in grid.items():
        nearby = [j for di in (-1, 0, 1) for dj in (-1, 0, 1) for j in grid.get((gi + di, gj + dj), ())]
        for i in members:
            for j in nearby:
                if j > i and haversine_km(*points[i], *points[j]) <= km:
                    ri, rj = find(i), find(j)
                    if ri != rj:
                        parent[ri] = rj

    groups = defaultdict(list)
    for idx in range(len(points)):
        groups[find(idx)].append(idx)
    return list(groups.values())


# --- districts ---------------------------------------------------------------------------------

class Districts:
    def __init__(self, features: list[dict]):
        from shapely import STRtree
        from shapely.geometry import shape

        self.props = [f["properties"] for f in features]
        self.tree = STRtree([shape(f["geometry"]) for f in features])

    @classmethod
    @lru_cache(maxsize=1)
    def india(cls) -> "Districts":
        with open(DISTRICTS_PATH) as f:
            return cls(json.load(f)["features"])

    def locate(self, points: list[tuple[float, float]]) -> list[dict | None]:
        """(lat, lon) points -> district properties {id, name, state} or None."""
        from shapely import points as make_points

        if not points:
            return []
        geoms = make_points([(lon, lat) for lat, lon in points])
        point_idx, district_idx = self.tree.query(geoms, predicate="within")
        found = {}
        for p, d in zip(point_idx.tolist(), district_idx.tolist()):
            found.setdefault(p, self.props[d])
        return [found.get(i) for i in range(len(points))]


# --- fire events -------------------------------------------------------------------------------

def build_events(spots: list[Hotspot], cfg: dict, districts: Districts, run_id: int | None,
                 now: datetime) -> list[dict]:
    """Cluster each acq_date's hotspots into fire_events rows (India only,
    minus fire.excluded_district_ids)."""
    excluded = set(cfg["fire"]["excluded_district_ids"])
    by_date = defaultdict(list)
    for s in spots:
        by_date[s.acq_date].append(s)

    rows = []
    for acq_date, day in sorted(by_date.items()):
        groups = [[day[i] for i in g] for g in cluster([(s.lat, s.lon) for s in day], cfg["fire"]["cluster_km"])]
        centroids = [(sum(s.lat for s in g) / len(g), sum(s.lon for s in g) / len(g)) for g in groups]
        for group, (lat, lon), place in zip(groups, centroids, districts.locate(centroids)):
            if place is None or place["id"] in excluded:
                continue
            # Anchor the id on the earliest hotspot, so it survives later
            # passes adding hotspots to the same fire.
            anchor = min(group, key=lambda s: (s.when, s.id))
            frps = [s.frp for s in group]
            rows.append({
                "id": "FIRE-" + anchor.id.removeprefix("FIRMS-"),
                "acq_date": acq_date,
                "latitude": round(lat, 5),
                "longitude": round(lon, 5),
                "hotspot_count": len(group),
                "frp_max": round(max(frps), 2),
                "frp_sum": round(sum(frps), 2),
                "first_seen": min(s.when for s in group).isoformat(),
                "last_seen": max(s.when for s in group).isoformat(),
                "confidence_nominal": sum(1 for s in group if s.confidence == "n"),
                "confidence_high": sum(1 for s in group if s.confidence == "h"),
                "district_id": place["id"],
                "district": place["name"],
                "state": place["state"],
                "last_run_id": run_id,
                "updated_at": now.isoformat(),
            })
    return rows


def store(supabase, rows: list[dict], dates: list[str], keep_from: date) -> int:
    """Replace the given days in fire_events; drop days before keep_from.

    Returns how many superseded rows (fires that merged or vanished on a
    later pass) were deleted.
    """
    for start in range(0, len(rows), BATCH_SIZE):
        supabase.table(TABLE).upsert(rows[start:start + BATCH_SIZE], on_conflict="id").execute()
    new_ids = {r["id"] for r in rows}
    stale = []
    for d in dates:
        existing = supabase.table(TABLE).select("id").eq("acq_date", d).execute().data
        stale += [r["id"] for r in existing if r["id"] not in new_ids]
    for start in range(0, len(stale), 100):
        supabase.table(TABLE).delete().in_("id", stale[start:start + 100]).execute()
    supabase.table(TABLE).delete().lt("acq_date", keep_from.isoformat()).execute()
    return len(stale)


def run_fire(supabase, run_id: int | None, results: dict, now: datetime, *, write: bool = True,
             cfg: dict | None = None, districts: Districts | None = None,
             mask: StaticMask | None = None) -> dict:
    """Rebuild fire_events for the days in this run's FIRMS window."""
    cfg = cfg or desk.severity_config.load()
    firms = results["FIRMS"]
    if firms.status != "ok":
        return {"skipped": f"FIRMS fetch was {firms.status}, fire_events left as they were"}

    fire_cfg = cfg["fire"]
    mask = mask if mask is not None else StaticMask.load(STATIC_MASK_PATH, fire_cfg["static_mask"]["neighbour_cells"])
    districts = districts or Districts.india()

    spots = hotspots(firms.rows, cfg)
    kept = [s for s in spots if not mask.masks(s.lat, s.lon)]
    rows = build_events(kept, cfg, districts, run_id, now)
    dates = sorted({s.acq_date for s in spots})

    superseded = 0
    if write:
        keep_from = now.date() - timedelta(days=fire_cfg["events_retention_days"])
        superseded = store(supabase, rows, dates, keep_from)

    per_district = defaultdict(int)
    for r in rows:
        per_district[(r["district"], r["state"])] += 1
    top = sorted(per_district.items(), key=lambda kv: -kv[1])[:5]
    return {
        "dates": dates,
        "hotspots": len(spots),
        "masked": len(spots) - len(kept),
        "mask_cells": len(mask),
        "fire_events": len(rows),
        "districts": len(per_district),
        "states": len({r["state"] for r in rows}),
        "superseded": superseded,
        "top_districts": [f"{d} ({s}) {n}" for (d, s), n in top],
    }
