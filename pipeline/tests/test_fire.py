"""fire.py: hotspot filter, static mask, clustering, districts, fire_events rebuild."""
import copy
import json
import math
import random
from datetime import datetime, timedelta, timezone

import pytest

import fire
from runs import FetchResult
from severity_config import load
from tests.fakes import FakeSupabase

NOW = datetime(2026, 10, 20, 15, 0, tzinfo=timezone.utc)
CFG = load()
KM_LON_1 = lambda lat: 1 / (fire.KM_PER_DEG_LAT * math.cos(math.radians(lat)))  # degrees of lon per km


def _row(lat, lon, acq_date="2026-10-20", acq_time="0812", confidence="n", frp=5.0):
    t = datetime.strptime(f"{acq_date} {acq_time}", "%Y-%m-%d %H%M").replace(tzinfo=timezone.utc)
    return {"id": f"FIRMS-{lat}-{lon}-{acq_date}-{acq_time}", "latitude": lat, "longitude": lon,
            "started_at": t.isoformat(), "severity_value": frp,
            "raw": {"acq_date": acq_date, "acq_time": acq_time, "confidence": confidence, "frp": str(frp)}}


# --- hotspots + mask -----------------------------------------------------------------------

def test_hotspots_keep_nominal_and_high_only():
    rows = [_row(30.0, 75.0, confidence=c) for c in ("l", "n", "h")]
    rows[1]["id"] += "b"
    assert [s.confidence for s in fire.hotspots(rows, CFG)] == ["n", "h"]


def test_hotspot_with_bad_fields_skipped():
    row = _row(30.0, 75.0)
    row["raw"]["frp"] = "nope"
    row["severity_value"] = "nope"
    assert fire.hotspots([row], CFG) == []


def test_static_mask_cell_and_neighbours(tmp_path):
    path = tmp_path / "mask.json"
    cell = 0.004
    path.write_text(json.dumps({"cell_deg": cell, "cells": [[math.floor(23.7 / cell), math.floor(86.4 / cell)]]}))
    mask = fire.StaticMask.load(path, neighbour_cells=1)
    assert mask.masks(23.7, 86.4)
    assert mask.masks(23.7 + cell, 86.4 - cell)          # neighbour cell
    assert not mask.masks(23.7 + 3 * cell, 86.4)
    assert not fire.StaticMask.load(path, neighbour_cells=0).masks(23.7 + cell, 86.4)


def test_missing_mask_file_masks_nothing(tmp_path):
    mask = fire.StaticMask.load(tmp_path / "absent.json", neighbour_cells=1)
    assert len(mask) == 0 and not mask.masks(23.7, 86.4)


# --- clustering -------------------------------------------------------------------------------

def test_haversine():
    assert fire.haversine_km(28.0, 77.0, 29.0, 77.0) == pytest.approx(111.19, rel=1e-3)


def _clusters(points, km=1.5):
    return sorted(sorted(g) for g in fire.cluster(points, km))


def test_close_points_join_far_points_dont():
    lat, lon = 30.0, 75.0
    one_km = 1.0 / fire.KM_PER_DEG_LAT
    assert _clusters([(lat, lon), (lat + one_km, lon)]) == [[0, 1]]
    assert _clusters([(lat, lon), (lat + 2 * one_km, lon)]) == [[0], [1]]


def test_single_linkage_chains():
    step = 1.2 / fire.KM_PER_DEG_LAT
    assert _clusters([(30.0 + i * step, 75.0) for i in range(5)]) == [[0, 1, 2, 3, 4]]


def test_far_east_high_latitude_pair_found():
    # Regression for a per-point longitude cell size: at 35 N, 97 E two
    # hotspots 1.4 km apart east-west must still be compared.
    lat = 35.0
    assert _clusters([(lat, 97.0), (lat, 97.0 + 1.4 * KM_LON_1(lat))]) == [[0, 1]]


def _brute_force(points, km):
    parent = list(range(len(points)))

    def find(x):
        while parent[x] != x:
            x = parent[x]
        return x
    for i in range(len(points)):
        for j in range(i + 1, len(points)):
            if fire.haversine_km(*points[i], *points[j]) <= km:
                parent[find(i)] = find(j)
    groups = {}
    for i in range(len(points)):
        groups.setdefault(find(i), []).append(i)
    return sorted(sorted(g) for g in groups.values())


@pytest.mark.parametrize("seed", range(5))
def test_grid_matches_brute_force(seed):
    rng = random.Random(seed)
    # Dense patches across India's latitude range, so many pairs sit near 1.5 km.
    points = [(rng.uniform(8, 37), rng.uniform(68, 97.4)) for _ in range(5)]
    points = [(lat + rng.gauss(0, 0.02), lon + rng.gauss(0, 0.02)) for lat, lon in points for _ in range(60)]
    assert _clusters(points) == _brute_force(points, 1.5)


def test_empty():
    assert fire.cluster([], 1.5) == []


# --- districts + build_events -------------------------------------------------------------------

def _square(fid, name, state, lon0, lat0, size=1.0):
    ring = [[lon0, lat0], [lon0 + size, lat0], [lon0 + size, lat0 + size], [lon0, lat0 + size], [lon0, lat0]]
    return {"type": "Feature", "properties": {"id": fid, "name": name, "state": state},
            "geometry": {"type": "Polygon", "coordinates": [ring]}}


DISTRICTS = fire.Districts([
    _square("D1", "Amritsar", "Punjab", 74.0, 31.0),
    _square("D2", "Karnal", "Haryana", 76.0, 29.0),
])


def test_locate():
    assert [p and p["name"] for p in DISTRICTS.locate([(31.5, 74.5), (29.5, 76.5), (25.0, 70.0)])] == [
        "Amritsar", "Karnal", None]


def test_build_events_per_day_and_india_only():
    spots = fire.hotspots([
        _row(31.5, 74.5, acq_time="0800", frp=3.0),
        _row(31.505, 74.5, acq_time="0812", frp=9.5, confidence="h"),
        _row(31.5, 74.5, acq_date="2026-10-19", acq_time="2030"),     # same place, previous day
        _row(29.5, 76.5, acq_time="0815"),
        _row(25.0, 70.0, acq_time="0815"),                            # outside the districts
    ], CFG)
    rows = fire.build_events(spots, CFG, DISTRICTS, run_id=7, now=NOW)
    assert [(r["acq_date"], r["district"], r["hotspot_count"]) for r in rows] == [
        ("2026-10-19", "Amritsar", 1), ("2026-10-20", "Amritsar", 2), ("2026-10-20", "Karnal", 1)]
    amritsar = rows[1]
    assert amritsar["id"] == "FIRE-31.5-74.5-2026-10-20-0800"           # earliest hotspot
    assert (amritsar["frp_max"], amritsar["frp_sum"]) == (9.5, 12.5)
    assert (amritsar["confidence_nominal"], amritsar["confidence_high"]) == (1, 1)
    assert amritsar["first_seen"].startswith("2026-10-20T08:00") and amritsar["last_seen"].startswith("2026-10-20T08:12")
    assert amritsar["state"] == "Punjab" and amritsar["last_run_id"] == 7
    assert amritsar["latitude"] == pytest.approx(31.5025)


# --- run_fire ----------------------------------------------------------------------------------

def _results(rows, status="ok"):
    return {"FIRMS": FetchResult("FIRMS", rows, True, status, None, 0.1)}


def _run(db, rows, now=NOW, run_id=1, mask=None, status="ok"):
    return fire.run_fire(db, run_id, _results(rows, status), now, cfg=CFG, districts=DISTRICTS,
                         mask=mask or fire.StaticMask(set(), 1.0, 0))


def test_run_fire_writes_and_replaces_superseded_rows():
    db = FakeSupabase()
    # 2.8 km apart: two fires.
    s1 = _run(db, [_row(31.5, 74.5, acq_time="0800"), _row(31.525, 74.5, acq_time="0805")])
    assert s1["fire_events"] == 2 and s1["superseded"] == 0
    # Later pass: a hotspot 1.4 km from each merges them into one fire.
    s2 = _run(db, [_row(31.5, 74.5, acq_time="0800"), _row(31.525, 74.5, acq_time="0805"),
                   _row(31.5125, 74.5, acq_time="2030")], run_id=2)
    assert s2["fire_events"] == 1 and s2["superseded"] == 1
    (row,) = db.rows("fire_events")
    assert row["id"] == "FIRE-31.5-74.5-2026-10-20-0800" and row["hotspot_count"] == 3 and row["last_run_id"] == 2


def test_run_fire_keeps_other_days_and_applies_retention():
    db = FakeSupabase({"fire_events": [
        {"id": "OLD", "acq_date": "2026-09-01"}, {"id": "KEEP", "acq_date": "2026-10-15"}]})
    _run(db, [_row(31.5, 74.5)])
    assert sorted(r["id"] for r in db.rows("fire_events")) == ["FIRE-31.5-74.5-2026-10-20-0812", "KEEP"]


def test_run_fire_applies_mask_before_clustering():
    cell = 0.004
    mask = fire.StaticMask({(math.floor(31.5 / cell), math.floor(74.5 / cell))}, cell, 1)
    s = _run(FakeSupabase(), [_row(31.5, 74.5), _row(31.51, 74.5, acq_time="0813"), _row(29.5, 76.5)], mask=mask)
    assert s["masked"] == 1 and s["fire_events"] == 2


def test_run_fire_skips_when_firms_failed():
    db = FakeSupabase({"fire_events": [{"id": "KEEP", "acq_date": "2026-10-20"}]})
    s = _run(db, [], status="error")
    assert "skipped" in s and db.rows("fire_events") == [{"id": "KEEP", "acq_date": "2026-10-20"}]


def test_dry_run_writes_nothing():
    db = FakeSupabase()
    fire.run_fire(db, None, _results([_row(31.5, 74.5)]), NOW, write=False, cfg=CFG, districts=DISTRICTS,
                  mask=fire.StaticMask(set(), 1.0, 0))
    assert db.calls == []


def test_real_district_file_places_known_fires():
    places = fire.Districts.india().locate([
        (31.63, 74.87),   # Amritsar city
        (31.45, 74.92),   # Tarn Taran, its neighbour
        (24.65, 77.31),   # Guna
        (28.63, 77.22),   # Connaught Place
        (23.79, 86.43),   # Dhanbad
        (35.92, 74.31),   # Gilgit: inside India's official boundary
        (33.70, 73.06),   # Islamabad: outside
    ])
    assert [(p["name"], p["state"]) if p else None for p in places] == [
        ("Amritsar", "Punjab"), ("Tarn Taran", "Punjab"), ("Guna", "Madhya Pradesh"), ("New Delhi", "Delhi"),
        ("Dhanbad", "Jharkhand"), ("Gilgit-Baltistan / PoK", "Ladakh"), None]
