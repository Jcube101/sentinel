"""watch.py: trend and rising streaks, the watching decision, category status, the quiet stage."""
import copy
from datetime import datetime, timedelta, timezone

import pytest

import desk
import watch
from runs import FetchResult
from severity_config import load
from tests.fakes import FakeSupabase

NOW = datetime(2026, 10, 21, 9, 0, tzinfo=timezone.utc)
CFG = load()
CFG["watching"].update(margin=0.05, rising_updates=3, rising_min_progress=0.5, keep_days=14)


def _subject(value, threshold=25, next_level=2, at=NOW, sid="fire:punjab", category="fire", level=1):
    return desk.WatchSubject(id=sid, category=category, title=sid.split(":")[1].title(), item_id=None, level=level,
                             next_level=next_level, metric="fire events", value=value, threshold=threshold,
                             source_updated_at=at)


def _series(values, threshold=25, next_level=2, step=timedelta(days=1)):
    """Feed values as successive source updates; return the last row."""
    row = None
    for i, v in enumerate(values):
        at = NOW + i * step
        row = watch.update_row(_subject(v, threshold, next_level, at), row, CFG, at, run_id=i + 1)
    return row


# --- trend and watching -------------------------------------------------------------------------

def test_rising_streak_counts_updates_toward_the_threshold():
    pts = lambda *vs, nl=2: [{"value": v, "threshold": 25, "next_level": nl} for v in vs]
    assert watch.rising_streak(pts(10, 13, 15, 18), 2) == 3
    assert watch.rising_streak(pts(13, 20, 15, 18), 2) == 1
    assert watch.rising_streak(pts(18, 18), 2) == 0
    assert watch.rising_streak(pts(10, 13) + pts(15, 18, nl=3), 3) == 1   # a new next level restarts the count
    assert watch.rising_streak(pts(13), 2) == 0 and watch.rising_streak([], 2) == 0


def test_trend_gets_a_point_only_for_new_source_data():
    first = watch.update_row(_subject(10), None, CFG, NOW, 1)
    same = watch.update_row(_subject(10), first, CFG, NOW + timedelta(hours=6), 2)       # 20:30 run, same day
    assert len(first["trend"]) == len(same["trend"]) == 1 and same["last_run_id"] == 2
    newer = watch.update_row(_subject(12, at=NOW + timedelta(days=1)), same, CFG, NOW + timedelta(days=1), 3)
    assert [p["value"] for p in newer["trend"]] == [10, 12]
    assert len(_series(range(1, 15))["trend"]) == watch.TREND_POINTS


def test_within_margin_is_watching():
    row = watch.update_row(_subject(24), None, CFG, NOW, 1)
    assert row["watching"] is True and row["distance_to_threshold"] == 0.04
    assert row["watch_reason"] == "4% below the Level 2 threshold (25)"
    assert watch.update_row(_subject(23), None, CFG, NOW, 1)["watching"] is False      # 8% below
    assert watch.update_row(_subject(25), None, CFG, NOW, 1)["watch_reason"] == "at the Level 2 threshold (25)"
    over = watch.update_row(_subject(30), None, CFG, NOW, 1)                           # above, yet not that level
    assert over["watching"] is False and over["distance_to_threshold"] == -0.2


def test_rising_three_updates_is_watching_from_half_the_threshold():
    row = _series([13, 15, 17, 19])
    assert row["rising_updates"] == 3 and row["watching"] is True
    assert row["watch_reason"] == "rising for 3 updates toward Level 2"
    assert _series([2, 3, 4, 5])["watching"] is False         # rising, but only a fifth of the way
    assert _series([13, 15, 17])["watching"] is False         # two updates
    assert _series([13, 15, 17, 24])["watch_reason"] == (
        "4% below the Level 2 threshold (25); rising for 3 updates toward Level 2")


def test_no_next_level_never_watching():
    row = watch.update_row(_subject(24, threshold=None, next_level=None), None, CFG, NOW, 1)
    assert row["watching"] is False and row["distance_to_threshold"] is None


def test_without_a_threshold_only_rising_counts():
    row = None
    for i, score in enumerate([0.5, 0.75, 1.0, 1.25]):           # a GDACS score rising episode after episode
        at = NOW + timedelta(hours=12 * i)
        subject = desk.WatchSubject("flood:GDACS-FL-1", "flood", "Flood", "flood:GDACS-FL-1", 1, 2,
                                    "GDACS episode alert score", score, None, at)
        row = watch.update_row(subject, row, CFG, at, i + 1)
    assert row["watching"] is True and row["distance_to_threshold"] is None
    assert row["watch_reason"] == "rising for 3 updates toward Level 2"


# --- category status ------------------------------------------------------------------------------

RESULTS = {name: FetchResult(name, [], True, "ok", None, 0.1) for name in ("USGS", "GDACS", "FIRMS", "OpenAQ")}
STAGES = {
    "desk": {"items": [], "watch": [], "sources_good": {"earthquake": True, "flood": True, "cyclone": True}},
    "fire_desk": {"items": [], "watch": [], "source_good": True, "note": None, "day": "2026-10-20"},
    "air": {"items": [], "watch": [], "source_good": True, "note": None},
}


def _item(item_id, category, level, title, last_known=False, status="open"):
    return {"id": item_id, "category": category, "severity_level": level, "title": title, "status": status,
            "last_known": last_known}


def _status(category, items=(), stages=STAGES, results=RESULTS, watching=0):
    stage = stages.get(watch.CATEGORY_SOURCES[category][2])
    return watch.category_status(category, list(items), results=results, stage=stage, cfg=load(),
                                 watching=watching, run_id=7, now=NOW)


def test_all_clear_lines():
    assert _status("earthquake")["summary"] == (
        "No quakes within 100 km of India, or M6+ in the region, in the last 48 h")
    assert _status("flood")["summary"] == "No current GDACS flood alerts for India"
    assert _status("cyclone")["summary"] == "No current GDACS cyclone alerts for India"
    assert _status("fire")["summary"] == "No state at 2× its seasonal fire norm on 20 Oct"
    assert _status("air")["summary"] == "No city Poor or worse (approx. CPCB band)"
    s = _status("flood")
    assert (s["level"], s["open_items"], s["last_known"], s["source"], s["source_status"]) == (
        None, 0, False, "GDACS", "ok")


def test_open_items_lead_with_the_highest_level():
    s = _status("fire", [_item("fire:a", "fire", 2, "Fire activity in 9 Madhya Pradesh districts"),
                         _item("fire:b", "fire", 2, "Fire activity in 4 Maharashtra districts"),
                         _item("fire:c", "fire", 3, "Forest fire in Uttarakhand")], watching=2)
    assert (s["level"], s["open_items"], s["watching"]) == (3, 3, 2)
    assert s["summary"] == "Forest fire in Uttarakhand (+2 more)"


def test_failed_source_or_stage_is_last_known():
    stages = copy.deepcopy(STAGES)
    stages["desk"]["sources_good"]["earthquake"] = False
    results = {**RESULTS, "USGS": FetchResult("USGS", [], False, "timeout", "t", 30)}
    s = _status("earthquake", stages=stages, results=results)
    assert s["last_known"] is True and s["source_status"] == "timeout"
    assert s["summary"].endswith(" · last known: USGS fetch failed this run")
    stages["air"] = {**stages["air"], "source_good": False, "note": "only 3 cities have data from the last 72 h (need 10)"}
    assert _status("air", stages=stages)["summary"].endswith("last known: only 3 cities have data from the last 72 h (need 10)")
    stages["fire_desk"] = None
    assert _status("fire", stages=stages)["summary"].endswith("last known: fire assessment failed this run")
    assert _status("air", [_item("air:IN", "air", 2, "Air quality: very poor in Ghaziabad", last_known=True)])["last_known"]


# --- the stage ---------------------------------------------------------------------------------------

def _stages(fire_watch=(), quake_watch=(), usgs_good=True):
    stages = copy.deepcopy(STAGES)
    stages["fire_desk"]["watch"] = list(fire_watch)
    stages["desk"]["watch"] = list(quake_watch)
    stages["desk"]["sources_good"]["earthquake"] = usgs_good
    return stages


def test_run_quiet_writes_watch_rows_and_status():
    db = FakeSupabase()
    summary = watch.run_quiet(db, 7, RESULTS, NOW, _stages([_subject(24), _subject(3, sid="fire:kerala")]), cfg=CFG)
    rows = {r["id"]: r for r in db.rows("desk_watch")}
    assert rows["fire:punjab"]["watching"] is True and rows["fire:kerala"]["watching"] is False
    statuses = {r["category"]: r for r in db.rows("category_status")}
    assert sorted(statuses) == sorted(watch.CATEGORIES) and statuses["fire"]["watching"] == 1
    assert all(r["run_id"] == 7 for r in statuses.values())
    assert summary["watching"] == ["Punjab (fire): 4% below the Level 2 threshold (25)"]
    assert summary["status"]["fire"] == "none open"


def test_closed_subject_stops_watching_but_a_failed_source_keeps_its_rows():
    db = FakeSupabase()
    quake = _subject(5.8, threshold=6.0, next_level=3, sid="earthquake:USGS-us1", category="earthquake", level=2)
    watch.run_quiet(db, 7, RESULTS, NOW, _stages(quake_watch=[quake]), cfg=CFG)
    assert db.rows("desk_watch")[0]["watching"] is True

    later = NOW + timedelta(hours=6)
    watch.run_quiet(db, 8, RESULTS, later, _stages(usgs_good=False), cfg=CFG)      # USGS down: kept as is
    assert db.rows("desk_watch")[0]["watching"] is True
    watch.run_quiet(db, 9, RESULTS, later, _stages(), cfg=CFG)                     # quake item closed
    (row,) = db.rows("desk_watch")
    assert row["watching"] is False and row["last_run_id"] == 9


def test_old_rows_are_deleted():
    db = FakeSupabase({"desk_watch": [{"id": "fire:goa", "category": "fire", "watching": False, "trend": [],
                                       "updated_at": (NOW - timedelta(days=15)).isoformat()}]})
    watch.run_quiet(db, 7, RESULTS, NOW, _stages([_subject(3)]), cfg=CFG)
    assert [r["id"] for r in db.rows("desk_watch")] == ["fire:punjab"]


def test_open_items_come_from_the_table_and_this_runs_stages():
    db = FakeSupabase({"desk_items": [_item("earthquake:USGS-us1", "earthquake", 2, "M5.4 earthquake, Assam")]})
    stages = _stages()
    stages["air"]["items"] = [_item("air:IN", "air", 2, "Air quality: very poor in Ghaziabad")]
    summary = watch.run_quiet(db, 7, RESULTS, NOW, stages, write=False, cfg=CFG)
    assert summary["status"]["earthquake"] == "L2" and summary["status"]["air"] == "L2"
    assert db.calls and all(op == "select" for _, op, _ in db.calls)


def test_dry_run_tolerates_missing_tables():
    db = FakeSupabase(missing={"desk_watch"})
    summary = watch.run_quiet(db, None, RESULTS, NOW, _stages([_subject(24)]), write=False, cfg=CFG)
    assert summary["watching"] == ["Punjab (fire): 4% below the Level 2 threshold (25)"]
    with pytest.raises(RuntimeError):
        watch.run_quiet(db, 7, RESULTS, NOW, _stages(), cfg=CFG)
