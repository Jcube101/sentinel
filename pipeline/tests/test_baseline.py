"""baseline.py: weeks, archive rows, static cells, daily counts, weekly norms."""
import copy
import gzip
import math
from datetime import date, datetime, timedelta, timezone

import pytest

import baseline
import fire
from severity_config import load
from tests.test_fire import DISTRICTS

CFG = load()


@pytest.mark.parametrize("day, week", [
    (date(2025, 1, 1), 1), (date(2025, 1, 7), 1), (date(2025, 1, 8), 2),
    (date(2025, 12, 23), 51), (date(2025, 12, 24), 52), (date(2025, 12, 31), 52), (date(2024, 12, 31), 52),
])
def test_week_of(day, week):
    assert baseline.week_of(day) == week


def _csv_row(lat, lon, acq_date="2025-11-01", acq_time="805", confidence="n", ftype="0", frp="4.5"):
    return {"latitude": str(lat), "longitude": str(lon), "acq_date": acq_date, "acq_time": acq_time,
            "confidence": confidence, "type": ftype, "frp": frp}


def test_to_hotspot_matches_live_id_scheme():
    s = baseline.to_hotspot(_csv_row(31.5, 74.5))
    assert s.id == "FIRMS-31.5-74.5-2025-11-01-805"
    assert s.when == datetime(2025, 11, 1, 8, 5, tzinfo=timezone.utc) and s.frp == 4.5
    assert baseline.to_hotspot({"latitude": "x"}) is None


def test_read_chunk(tmp_path):
    path = tmp_path / "2025-11-01.csv.gz"
    with gzip.open(path, "wt") as f:
        f.write("latitude,longitude,acq_date,acq_time,confidence,type\n31.5,74.5,2025-11-01,805,n,0\n")
    assert baseline.read_chunk(path)[0]["type"] == "0"


def test_static_cells_need_min_detections_and_right_types():
    cell = 0.004
    rows = [_csv_row(23.7, 86.4, ftype="2")] * 3 + [_csv_row(22.0, 88.0, ftype="2")] + \
           [_csv_row(12.27, 93.86, ftype="1")] * 2 + [_csv_row(30.0, 75.0, ftype="0")] * 9
    counts = baseline.count_static_cells(rows, {1, 2, 3}, cell)
    cells = baseline.mask_cells(counts, min_detections=2)
    assert cells == {(math.floor(23.7 / cell), math.floor(86.4 / cell)), (math.floor(12.27 / cell), math.floor(93.86 / cell))}


def test_count_day_like_live_fire_events():
    spots = [baseline.to_hotspot(r) for r in (
        _csv_row(31.5, 74.5), _csv_row(31.505, 74.5, acq_time="806"),   # one fire, 2 hotspots
        _csv_row(31.8, 74.6),                                           # second Punjab fire
        _csv_row(29.5, 76.5),                                           # Haryana
        _csv_row(25.0, 70.0),                                           # outside the districts
    )]
    mask = fire.StaticMask(set(), 1.0, 0)
    assert baseline.count_day(spots, CFG, DISTRICTS, mask) == {"Punjab": [2, 3], "Haryana": [1, 1]}

    cell = 0.004
    masked = fire.StaticMask({(math.floor(29.5 / cell), math.floor(76.5 / cell))}, cell, 1)
    assert baseline.count_day(spots, CFG, DISTRICTS, masked) == {"Punjab": [2, 3]}


def test_aggregate_zero_days_smoothing_and_national():
    start, end = date(2025, 1, 1), date(2025, 12, 31)
    daily = {("Punjab", date(2025, 1, 2)): [14, 20],    # week 1
             ("Haryana", date(2025, 1, 9)): [7, 7],     # week 2
             ("Punjab", date(2025, 12, 30)): [9, 9]}    # week 52 (8 days in 2025, 9 in a leap year)
    rows = {(r["state"], r["week"]): r for r in baseline.aggregate(daily, ["Haryana", "Punjab"], start, end, 0, "2025")}
    assert len(rows) == 3 * 52
    assert rows[("Punjab", 1)]["mean_daily_events"] == 2.0          # 14 events / 7 days
    assert rows[("Punjab", 2)]["mean_daily_events"] == 0.0
    assert rows[("Punjab", 52)]["mean_daily_events"] == 1.125       # 9 / 8 days
    assert rows[("Punjab", 52)]["days"] == 8
    assert rows[("India", 2)]["mean_daily_events"] == 1.0
    assert rows[("India", 1)]["mean_daily_hotspots"] == pytest.approx(20 / 7, abs=1e-4)

    smooth = {(r["state"], r["week"]): r for r in baseline.aggregate(daily, ["Haryana", "Punjab"], start, end, 1, "2025")}
    # Week 1 smoothed over weeks 52, 1, 2 (wraps around the year): (9 + 14 + 0) / (8 + 7 + 7)
    assert smooth[("Punjab", 1)]["mean_daily_events"] == round(23 / 22, 4)
    assert smooth[("Punjab", 1)]["mean_daily_events_week"] == 2.0
    assert smooth[("Punjab", 1)]["max_daily_events"] == 14 and smooth[("Punjab", 1)]["days"] == 22


def test_csv_round_trip(tmp_path):
    rows = baseline.aggregate({("Punjab", date(2025, 1, 2)): [14, 20]}, ["Punjab"],
                              date(2025, 1, 1), date(2025, 12, 31), 1, "2025")
    path = tmp_path / "b.csv"
    baseline.write_csv(rows, path)
    loaded = baseline.load(path)
    assert loaded[("Punjab", 1)]["mean_daily_events"] == rows[0]["mean_daily_events"]
    assert isinstance(loaded[("India", 52)]["days"], int)


def test_config_build_parameters():
    m = CFG["fire"]["static_mask"]
    assert (m["mask_types"], m["cell_deg"], m["min_detections"]) == ([1, 2, 3], 0.004, 2)
    assert CFG["fire"]["baseline"] == {"years": [2024, 2025], "smooth_weeks": 1}


def test_days_missing_from_the_archive_are_not_counted_as_zero():
    start, end = date(2025, 1, 1), date(2025, 12, 31)
    daily = {("Punjab", date(2025, 1, 2)): [12, 12]}
    covered = {start + timedelta(days=i) for i in range(365)} - {date(2025, 1, 5)}
    rows = {(r["state"], r["week"]): r for r in baseline.aggregate(daily, ["Punjab"], start, end, 0, "2025", covered)}
    assert rows[("Punjab", 1)]["days"] == 6 and rows[("Punjab", 1)]["mean_daily_events"] == 2.0   # 12 / 6
