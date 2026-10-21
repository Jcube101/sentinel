"""desk.py: quake scope and levels, GDACS levels and "rising", lifecycle rules."""
from datetime import datetime, timedelta, timezone
from types import SimpleNamespace

import pytest

import desk
from runs import FetchResult
from severity_config import load
from tests.fakes import FakeSupabase

NOW = datetime(2026, 10, 20, 15, 0, tzinfo=timezone.utc)
CFG = load()


def _quake(qid="us1", mag=4.6, hours_ago=3, lat=28.6, lon=77.2, updated_ms=None):
    t = NOW - timedelta(hours=hours_ago)
    return {
        "id": f"USGS-{qid}", "started_at": t.isoformat(), "latitude": lat, "longitude": lon,
        "severity_value": mag, "place_name": "10 km SE of Somewhere, India",
        "geometry": {"type": "Point", "coordinates": [lon, lat, 10.0]},
        "raw": {"mag": mag, "magType": "mb", "place": "10 km SE of Somewhere, India",
                "updated": updated_ms or int(t.timestamp() * 1000), "alert": None, "tsunami": 0, "felt": 3},
    }


def _alert(eid=1, kind="FL", level="Green", score=0.5, episode=1, current=True, modified="2026-10-20T10:00:00+00:00"):
    return {
        "id": f"GDACS-{kind}-{eid}", "eventtype": kind, "eventid": eid, "name": f"{kind} in India",
        "alertlevel": level, "alertscore": 1.0, "episodeid": episode,
        "episodealertlevel": level, "episodealertscore": score,
        "severity": None, "severity_text": None, "severity_unit": None,
        "iscurrent": current, "fromdate": "2026-10-18T00:00:00+00:00", "todate": "2026-10-21T00:00:00+00:00",
        "datemodified": modified, "latitude": 22.0, "longitude": 88.0,
        "countries": ["IND"], "country_names": ["India"], "url": "https://www.gdacs.org/report",
    }


def _distance(km):
    return lambda lat, lon: km


# --- quake candidates ------------------------------------------------------------

@pytest.mark.parametrize("mag, level", [(4.0, 1), (4.94, 1), (4.96, 2), (5.9, 2), (6.0, 3), (6.9, 3), (7.0, 4), (8.1, 4)])
def test_quake_levels_follow_config(mag, level):
    (c,) = desk.quake_candidates([_quake(mag=mag)], CFG, NOW, _distance(0))
    assert c.level == level
    assert c.title.startswith(f"M{round(mag, 1):.1f} earthquake")


def test_quake_in_india():
    (c,) = desk.quake_candidates([_quake(mag=4.6)], CFG, NOW, _distance(0))
    assert c.id == "earthquake:USGS-us1" and c.source == "USGS" and c.source_ref == "USGS-us1"
    assert c.reason == "M4.6, in India (USGS)"
    assert c.figures["in_india"] is True and c.figures["depth_km"] == 10.0


def test_quake_within_buffer_kept_beyond_dropped():
    assert desk.quake_candidates([_quake(mag=5.2)], CFG, NOW, _distance(99))[0].reason == "M5.2, 99 km from India (USGS)"
    assert desk.quake_candidates([_quake(mag=5.9)], CFG, NOW, _distance(101)) == []


def test_big_quake_anywhere_in_box_kept():
    (c,) = desk.quake_candidates([_quake(mag=6.1)], CFG, NOW, _distance(400))
    assert c.level == 3 and c.reason == "M6.1, 400 km from India (USGS)"


def test_old_quakes_are_not_candidates():
    hours = CFG["quake"]["lifecycle"]["close_after_hours"]
    assert desk.quake_candidates([_quake(hours_ago=hours + 1)], CFG, NOW, _distance(0)) == []


def test_quake_with_missing_fields_skipped():
    row = _quake()
    row["raw"]["mag"] = None
    row["severity_value"] = None
    assert desk.quake_candidates([row], CFG, NOW, _distance(0)) == []


# --- GDACS candidates ------------------------------------------------------------

@pytest.mark.parametrize("colour, level", [("Green", 1), ("Orange", 3), ("Red", 4), (None, 1)])
def test_gdacs_levels(colour, level):
    (c,) = desk.gdacs_candidates([_alert(level=colour)], {}, CFG)
    assert c.level == level


def test_cyclone_and_flood_ids_and_skips():
    alerts = [_alert(1, "FL"), _alert(2, "TC"), _alert(3, "WF"), _alert(4, "EQ"), _alert(5, "FL", current=False)]
    assert [c.id for c in desk.gdacs_candidates(alerts, {}, CFG)] == ["flood:GDACS-FL-1", "cyclone:GDACS-TC-2"]


def _stored(candidate):
    return {"figures": candidate.figures}


def test_green_rising_on_new_episode_with_higher_score():
    (first,) = desk.gdacs_candidates([_alert(score=0.5, episode=1)], {}, CFG)
    assert first.level == 1 and first.figures["rising"] is False

    existing = {first.id: _stored(first)}
    (second,) = desk.gdacs_candidates([_alert(score=0.8, episode=2)], existing, CFG)
    assert second.level == 2
    assert second.reason == "GDACS Green alert, rising (alert score 0.5 → 0.8)"

    # Same episode again on the next run: still rising (compared with episode 1).
    (third,) = desk.gdacs_candidates([_alert(score=0.8, episode=2)], {first.id: _stored(second)}, CFG)
    assert third.level == 2

    # Next episode flat: no longer rising.
    (fourth,) = desk.gdacs_candidates([_alert(score=0.8, episode=3)], {first.id: _stored(third)}, CFG)
    assert fourth.level == 1


def test_level_follows_current_episode_and_notes_peak():
    alert = _alert(level="Green")
    alert["alertlevel"] = "Orange"  # event peaked Orange, latest episode Green
    (c,) = desk.gdacs_candidates([alert], {}, CFG)
    assert c.level == 1 and c.reason == "GDACS Green alert (event peaked Orange)"


def test_orange_ignores_rising():
    (first,) = desk.gdacs_candidates([_alert(level="Orange", score=1.5, episode=1)], {}, CFG)
    (second,) = desk.gdacs_candidates([_alert(level="Orange", score=2.0, episode=2)], {first.id: _stored(first)}, CFG)
    assert second.level == 3 and "rising" in second.reason


# --- reconcile -------------------------------------------------------------------

def _cand(level=1, cid="earthquake:USGS-us1", updated=NOW):
    return desk.Candidate(
        id=cid, category="earthquake", source="USGS", source_ref="USGS-us1", title="M4.6 earthquake",
        place_name=None, latitude=28.6, longitude=77.2, level=level, reason=f"level {level}",
        observed_at=NOW - timedelta(hours=1), source_updated_at=updated, figures={"magnitude": 4.6})


def _reconcile(existing, candidates, source_good=True, expired=lambda item: False, run_id=2, now=NOW, open_min=1):
    return desk.reconcile(existing, candidates, categories={"earthquake"}, source_good=source_good,
                          open_min_level=open_min, expired=expired, now=now, run_id=run_id)


def _stored_item(**overrides):
    (row,), _ = _reconcile({}, [_cand()], run_id=1, now=NOW - timedelta(hours=8))
    row.update(overrides)
    return row


def test_new_candidate_opens():
    (row,), (snap,) = _reconcile({}, [_cand(level=2)])
    assert row["status"] == "open" and row["opened_at"] == NOW.isoformat()
    assert row["first_run_id"] == row["last_run_id"] == 2 and row["peak_level"] == 2
    assert snap["change"] == "opened" and snap["new_data"] is True and snap["run_id"] == 2


def test_below_open_min_level_does_not_open():
    assert _reconcile({}, [_cand(level=1)], open_min=2) == ([], [])


def test_level_up_escalates_down_deescalates():
    old = _stored_item()
    (row,), (snap,) = _reconcile({old["id"]: old}, [_cand(level=3)])
    assert snap["change"] == "escalated" and row["escalated_at"] == NOW.isoformat() and row["peak_level"] == 3
    assert row["opened_at"] == old["opened_at"] and row["first_run_id"] == 1

    (row2,), (snap2,) = _reconcile({row["id"]: row}, [_cand(level=2)])
    assert snap2["change"] == "deescalated" and row2["peak_level"] == 3 and row2["escalated_at"] == NOW.isoformat()


def test_unchanged_item_snapshots_without_change():
    old = _stored_item()
    (row,), (snap,) = _reconcile({old["id"]: old}, [_cand(level=1, updated=NOW - timedelta(hours=8))])
    assert snap["change"] is None and snap["new_data"] is False and row["status"] == "open"


def test_newer_source_update_is_new_data():
    old = _stored_item(source_updated_at=(NOW - timedelta(hours=8)).isoformat())
    _, (snap,) = _reconcile({old["id"]: old}, [_cand(updated=NOW)])
    assert snap["new_data"] is True


def test_missing_from_good_fetch_closes():
    old = _stored_item()
    (row,), (snap,) = _reconcile({old["id"]: old}, [])
    assert row["status"] == "closed" and row["closed_at"] == NOW.isoformat()
    assert snap["change"] == "closed" and snap["status"] == "closed"


def test_source_failure_keeps_item_as_last_known():
    old = _stored_item()
    (row,), (snap,) = _reconcile({old["id"]: old}, [], source_good=False)
    assert row["status"] == "open" and row["last_known"] is True and row["severity_level"] == old["severity_level"]
    assert snap["last_known"] is True and snap["change"] is None and snap["new_data"] is False


def test_expired_item_closes_even_when_source_failed():
    old = _stored_item()
    (row,), (snap,) = _reconcile({old["id"]: old}, [], source_good=False, expired=lambda item: True)
    assert row["status"] == "closed" and snap["change"] == "closed"


def test_recovery_clears_last_known():
    old = _stored_item(last_known=True)
    (row,), _ = _reconcile({old["id"]: old}, [_cand()])
    assert row["last_known"] is False


def test_closed_item_reopens():
    old = _stored_item(status="closed", closed_at=(NOW - timedelta(hours=2)).isoformat())
    (row,), (snap,) = _reconcile({old["id"]: old}, [_cand()])
    assert row["status"] == "open" and row["closed_at"] is None and snap["change"] == "reopened"


def test_closes_rule_closes_an_item_that_still_has_a_candidate():
    old = _stored_item()
    args = dict(categories={"earthquake"}, source_good=True, open_min_level=1, expired=lambda item: False,
                now=NOW, run_id=2)
    (row,), (snap,) = desk.reconcile({old["id"]: old}, [_cand(level=1)], closes=lambda c, item: True, **args)
    assert row["status"] == "closed" and row["closed_at"] == NOW.isoformat() and snap["change"] == "closed"
    assert row["severity_reason"] == "level 1"  # closes with this run's data, not the stored item's
    (row,), (snap,) = desk.reconcile({old["id"]: old}, [_cand(level=1)], closes=lambda c, item: False, **args)
    assert row["status"] == "open" and snap["change"] is None


def test_already_closed_items_are_not_resnapshotted():
    old = _stored_item(status="closed")
    assert _reconcile({old["id"]: old}, []) == ([], [])


def test_other_categories_left_alone():
    flood = _stored_item(id="flood:GDACS-FL-1", category="flood")
    assert _reconcile({flood["id"]: flood}, []) == ([], [])


def test_rows_have_every_column():
    (row,), _ = _reconcile({}, [_cand()])
    assert tuple(row) == desk.ITEM_COLUMNS


# --- run_desk end to end (fake Supabase) -------------------------------------------

def _results(usgs_rows=(), alerts=(), usgs_status="ok", gdacs_status="ok"):
    def r(name, rows, status, extras=None):
        return FetchResult(name=name, rows=list(rows), ok=True, status=status, error=None,
                           duration_s=0.1, extras=extras or {})
    return {"USGS": r("USGS", usgs_rows, usgs_status),
            "GDACS": r("GDACS", [], gdacs_status, {"alerts": list(alerts)})}


def test_run_desk_lifecycle_across_runs():
    db = FakeSupabase()
    quake = _quake(mag=5.4)
    results = _results([quake], [_alert(1, "FL", "Orange", score=1.5)])

    s1 = desk.run_desk(db, 1, results, NOW, cfg=CFG, km_from_india=_distance(0))
    assert s1["open"] == 2 and s1["max_level"] == 3
    assert s1["changes"] == {"earthquake:USGS-us1": "opened", "flood:GDACS-FL-1": "opened"}
    assert {r["id"] for r in db.rows("desk_items")} == {"earthquake:USGS-us1", "flood:GDACS-FL-1"}

    # Run 2: GDACS times out -> the flood stays open as last-known.
    s2 = desk.run_desk(db, 2, _results([quake], gdacs_status="timeout"), NOW + timedelta(hours=6),
                       cfg=CFG, km_from_india=_distance(0))
    assert s2["open"] == 2 and s2["last_known"] == 1 and s2["changes"] == {}

    # Run 3, 49 h later: the quake ages out, GDACS reports the flood finished.
    later = NOW + timedelta(hours=49)
    s3 = desk.run_desk(db, 3, _results([quake], [_alert(1, "FL", "Orange", current=False)]), later,
                       cfg=CFG, km_from_india=_distance(0))
    assert s3["open"] == 0
    assert s3["changes"] == {"earthquake:USGS-us1": "closed", "flood:GDACS-FL-1": "closed"}

    snaps = db.rows("desk_item_snapshots")
    assert [(s["run_id"], s["item_id"].split(":")[0], s["change"]) for s in snaps] == [
        (1, "earthquake", "opened"), (1, "flood", "opened"),
        (2, "earthquake", None), (2, "flood", None),
        (3, "earthquake", "closed"), (3, "flood", "closed"),
    ]
    assert [s["last_known"] for s in snaps if s["run_id"] == 2] == [False, True]

    # Run 4: nothing open, nothing to snapshot.
    s4 = desk.run_desk(db, 4, _results(), later + timedelta(hours=6), cfg=CFG, km_from_india=_distance(0))
    assert {k: s4[k] for k in ("open", "max_level", "last_known", "changes")} == {
        "open": 0, "max_level": None, "last_known": 0, "changes": {}}


def test_dry_run_reads_but_never_writes_and_tolerates_missing_tables():
    db = FakeSupabase(missing={"desk_items", "desk_item_snapshots"})
    summary = desk.run_desk(db, None, _results([_quake()]), NOW, write=False, cfg=CFG,
                            km_from_india=_distance(0))
    assert summary["open"] == 1
    assert all(op == "select" for _, op, _ in db.calls)


def test_real_run_fails_loudly_when_tables_missing():
    db = FakeSupabase(missing={"desk_items"})
    with pytest.raises(RuntimeError):
        desk.run_desk(db, 1, _results([_quake()]), NOW, cfg=CFG, km_from_india=_distance(0))


# --- watching (step 7) ------------------------------------------------------------------------

def _open_item(item_id, category, level, figures, status="open"):
    return {"id": item_id, "category": category, "title": f"{category} {item_id}", "severity_level": level,
            "status": status, "figures": figures, "source_updated_at": NOW.isoformat()}


def test_quake_watch_against_the_next_magnitude_band():
    items = [_open_item("earthquake:a", "earthquake", 2, {"magnitude": 5.8}),
             _open_item("earthquake:b", "earthquake", 4, {"magnitude": 7.2}),
             _open_item("earthquake:c", "earthquake", 1, {"magnitude": 4.8}, status="closed"),
             _open_item("flood:x", "flood", 1, {"episode_alert_score": 0.5})]
    a, b = desk.quake_watch(items, CFG)
    assert (a.id, a.item_id, a.level, a.next_level, a.value, a.threshold) == ("earthquake:a", "earthquake:a", 2, 3, 5.8, 6.0)
    assert (b.next_level, b.threshold) == (None, None)


def test_gdacs_watch_has_no_threshold():
    (s,) = desk.gdacs_watch([_open_item("flood:x", "flood", 1, {"episode_alert_score": 0.5}),
                             _open_item("earthquake:a", "earthquake", 2, {"magnitude": 5.8})])
    assert (s.category, s.next_level, s.value, s.threshold) == ("flood", 2, 0.5, None)
