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


def test_cyclone_without_a_track_gives_the_peak_wind_as_the_peak():
    # ARNAB-26: the search API's "Tropical Storm (maximum wind speed of 222 km/h)" is the
    # storm's peak; without the timeline there is no wind for now.
    alert = {**_alert(kind="TC", level="Orange", score=2.0), "alertlevel": "Red", "severity": 222.2208,
             "severity_unit": "km/h", "severity_text": "Tropical Storm (maximum wind speed of 222 km/h)"}
    (c,) = desk.gdacs_candidates([alert], {}, CFG)
    assert c.reason == "GDACS Orange alert, 222 km/h peak winds (event peaked Red)"
    assert (c.figures["wind_kmh"], c.figures["peak_wind_kmh"], c.figures["track"]) == (None, 222, [])
    flood = {**_alert(), "severity": 120.0, "severity_unit": "km/h"}   # only cyclones carry a wind speed
    (f,) = desk.gdacs_candidates([flood], {}, CFG)
    assert f.reason == "GDACS Green alert" and "wind_kmh" not in f.figures and "track" not in f.figures


# ARNAB-26's observed track as GDACS's timeline gave it on 30 Oct 2026 (UTC; wind m/s -> km/h).
ARNAB_TRACK = [
    {"at": f"2026-{t}:00:00+00:00", "latitude": lat, "longitude": lon, "wind_kmh": w,
     "storm_status": st}
    for t, lat, lon, w, st in [
        ("10-26T00", 16, 89.1, 65, "Tropical Storm"),
        ("10-26T06", 15.3, 88.4, 120, "Hurricane/Typhoon > 74 mph"),
        ("10-26T12", 15.9, 87.2, 148, "Hurricane/Typhoon > 74 mph"),
        ("10-26T18", 16, 85.8, 148, "Hurricane/Typhoon > 74 mph"),
        ("10-27T00", 16, 84.8, 167, "Hurricane/Typhoon > 74 mph"),
        ("10-27T06", 16.2, 83.8, 213, "Hurricane/Typhoon > 74 mph"),
        ("10-27T12", 16.3, 82.7, 222, "Hurricane/Typhoon > 74 mph"),
        ("10-27T18", 16.4, 81.6, 185, "Hurricane/Typhoon > 74 mph"),
        ("10-28T00", 16.2, 81.6, 120, "Hurricane/Typhoon > 74 mph"),
        ("10-28T06", 16.4, 81.8, 102, "Tropical Storm"),
    ]
]
ARNAB_LAST = datetime(2026, 10, 28, 6, 0, tzinfo=timezone.utc)


def _arnab(track=ARNAB_TRACK, episode=10, todate=ARNAB_LAST):
    alert = {**_alert(eid=1001345, kind="TC", level="Orange", score=2.0, episode=episode), "alertlevel": "Red",
             "name": "Tropical Cyclone ARNAB-26", "severity": 222.2208, "severity_unit": "km/h",
             "fromdate": "2026-10-26T00:00:00+00:00", "todate": todate.isoformat(),
             "latitude": 16.4, "longitude": 81.8}
    if track is not None:
        alert["track"] = [dict(p) for p in track]
    return alert


def test_cyclone_reason_gives_the_latest_wind_and_the_peak():
    (c,) = desk.gdacs_candidates([_arnab()], {}, CFG, ARNAB_LAST + timedelta(hours=3))
    assert c.reason == "GDACS Orange alert, 102 km/h winds (peaked at 222 km/h)"
    f = c.figures
    assert (f["wind_kmh"], f["wind_at"]) == (102, "2026-10-28T06:00:00+00:00")
    assert (f["peak_wind_kmh"], f["peak_wind_at"]) == (222, "2026-10-27T12:00:00+00:00")
    assert f["advisories_stopped"] is False


def test_cyclone_at_its_peak_has_no_peak_note_but_keeps_the_colour_note():
    rising = _arnab(track=ARNAB_TRACK[:7], todate=datetime(2026, 10, 27, 12, tzinfo=timezone.utc))
    (c,) = desk.gdacs_candidates([rising], {}, CFG, datetime(2026, 10, 27, 15, tzinfo=timezone.utc))
    assert c.reason == "GDACS Orange alert, 222 km/h winds (event peaked Red)"


def test_cyclone_track_is_placed_and_gives_the_landfall():
    (c,) = desk.gdacs_candidates([_arnab()], {}, CFG, ARNAB_LAST)
    track = c.figures["track"]
    assert [p["state"] for p in track] == [None] * 7 + ["Andhra Pradesh", None, "Andhra Pradesh"]
    assert track[-1]["district"] == "East Godavari" and track[-1]["wind_kmh"] == 102
    assert c.figures["landfall"] == {"at": "2026-10-27T18:00:00+00:00", "latitude": 16.4, "longitude": 81.6,
                                     "state": "Andhra Pradesh", "district": "West Godavari"}
    at_sea = desk.gdacs_candidates([_arnab(track=ARNAB_TRACK[:7])], {}, CFG, ARNAB_LAST)[0]
    assert at_sea.figures["landfall"] is None


def test_cyclone_keeps_its_stored_track_when_this_run_has_none_for_the_same_episode():
    (first,) = desk.gdacs_candidates([_arnab()], {}, CFG, ARNAB_LAST)
    (again,) = desk.gdacs_candidates([_arnab(track=None)], {first.id: _stored(first)}, CFG, ARNAB_LAST)
    assert again.figures["track"] == first.figures["track"] and again.figures["wind_kmh"] == 102
    (newer,) = desk.gdacs_candidates([_arnab(track=None, episode=11)], {first.id: _stored(first)}, CFG, ARNAB_LAST)
    assert newer.figures["wind_kmh"] is None and newer.reason.startswith("GDACS Orange alert, 222 km/h peak winds")


def test_cyclone_advisories_stop_after_the_configured_hours():
    hours = CFG["gdacs"]["lifecycle"]["cyclone_finished_after_hours"]
    at = lambda h: desk.gdacs_candidates([_arnab()], {}, CFG, ARNAB_LAST + timedelta(hours=h))[0]
    assert at(hours).figures["advisories_stopped"] is False
    assert at(hours + 1).figures["advisories_stopped"] is True
    flood = {**_alert(), "todate": "2026-09-01T00:00:00+00:00"}   # floods aren't closed on age
    assert "advisories_stopped" not in desk.gdacs_candidates([flood], {}, CFG, NOW)[0].figures


def test_cyclone_position_is_the_storm_at_the_episode_time():
    # ARNAB-26 episode 10: GDACS's point is the track point at 28/10 06:00 UTC
    first = {**_alert(kind="TC", level="Orange", episode=9), "latitude": 16.2, "longitude": 81.6,
             "todate": "2026-10-28T00:00:00+00:00"}
    (c,) = desk.gdacs_candidates([first], {}, CFG)
    assert c.figures["position"] == {"latitude": 16.2, "longitude": 81.6, "at": "2026-10-28T00:00:00+00:00"}
    moved = {**first, "episodeid": 10, "latitude": 16.4, "longitude": 81.8, "todate": "2026-10-28T06:00:00+00:00"}
    (c,) = desk.gdacs_candidates([moved], {c.id: _stored(c)}, CFG)
    assert (c.latitude, c.longitude) == (16.4, 81.8)
    assert c.figures["position"] == {"latitude": 16.4, "longitude": 81.8, "at": "2026-10-28T06:00:00+00:00"}
    assert "position" not in desk.gdacs_candidates([_alert()], {}, CFG)[0].figures   # a flood's point is its area


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


def test_snapshots_keep_title_place_and_position_as_of_the_run():
    (row,), (snap,) = _reconcile({}, [_cand(level=2)])
    assert (snap["title"], snap["place_name"], snap["latitude"], snap["longitude"]) == (
        "M4.6 earthquake", None, 28.6, 77.2)
    moved = {**row, "title": "M4.6 earthquake, revised", "place_name": "Uttarakhand", "latitude": 30.1,
             "longitude": 79.0}
    _, (kept,) = _reconcile({row["id"]: moved}, [], source_good=False)   # last-known: the stored values
    assert (kept["title"], kept["place_name"], kept["latitude"], kept["longitude"]) == (
        "M4.6 earthquake, revised", "Uttarakhand", 30.1, 79.0)
    _, (closed,) = _reconcile({row["id"]: moved}, [])                       # closes: its last place
    assert closed["change"] == "closed" and (closed["latitude"], closed["longitude"]) == (30.1, 79.0)


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


def test_update_takes_the_source_that_set_the_level():
    old = _stored_item(source="OPENAQ")
    (row,), _ = _reconcile({old["id"]: old}, [_cand(level=2)])
    assert row["source"] == "USGS" and row["opened_at"] == old["opened_at"]


def test_last_known_keeps_the_source_of_the_last_level():
    old = _stored_item(source="OPENAQ")
    (row,), _ = _reconcile({old["id"]: old}, [], source_good=False)
    assert row["last_known"] is True and row["source"] == "OPENAQ"


def test_already_closed_items_are_not_resnapshotted():
    old = _stored_item(status="closed")
    assert _reconcile({old["id"]: old}, []) == ([], [])


def test_other_categories_left_alone():
    flood = _stored_item(id="flood:GDACS-FL-1", category="flood")
    assert _reconcile({flood["id"]: flood}, []) == ([], [])


def test_rows_have_every_column():
    (row,), _ = _reconcile({}, [_cand()])
    assert tuple(row) == desk.ITEM_COLUMNS


def test_ended_candidate_closes_an_open_item_but_never_opens_or_reopens_one():
    args = dict(categories={"earthquake"}, source_good=True, open_min_level=1, expired=lambda item: False,
                now=NOW, run_id=2, ended=lambda c: c.reason == "ended")
    ended = desk.Candidate(**{**_cand().__dict__, "reason": "ended"})
    old = _stored_item()
    (row,), (snap,) = desk.reconcile({old["id"]: old}, [ended], **args)
    assert row["status"] == "closed" and snap["change"] == "closed" and row["severity_reason"] == "ended"
    assert desk.reconcile({}, [ended], **args) == ([], [])
    closed = _stored_item(status="closed", closed_at=(NOW - timedelta(hours=2)).isoformat())
    assert desk.reconcile({closed["id"]: closed}, [ended], **args) == ([], [])
    (row,), (snap,) = desk.reconcile({closed["id"]: closed}, [_cand()], **args)
    assert row["status"] == "open" and snap["change"] == "reopened"


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


def test_run_desk_closes_a_cyclone_whose_advisories_stopped_and_reopens_on_a_new_one():
    db = FakeSupabase()
    item = "cyclone:GDACS-TC-1001345"
    s1 = desk.run_desk(db, 1, _results(alerts=[_arnab()]), ARNAB_LAST + timedelta(hours=3), cfg=CFG)
    assert s1["changes"] == {item: "opened"} and s1["max_level"] == 3

    # Two days on, GDACS still lists ARNAB-26 as current with no new advisory.
    s2 = desk.run_desk(db, 2, _results(alerts=[_arnab()]), ARNAB_LAST + timedelta(hours=48), cfg=CFG)
    assert s2["open"] == 0 and s2["changes"] == {item: "closed"}
    (row,) = db.rows("desk_items")
    assert row["status"] == "closed" and row["figures"]["advisories_stopped"] is True
    assert row["severity_reason"] == "GDACS Orange alert, 102 km/h winds (peaked at 222 km/h)"

    # Still listed, still no advisory: stays closed, no new snapshot.
    s3 = desk.run_desk(db, 3, _results(alerts=[_arnab()]), ARNAB_LAST + timedelta(hours=54), cfg=CFG)
    assert s3["changes"] == {} and len(db.rows("desk_item_snapshots")) == 2

    # A new advisory reopens it.
    fresh = ARNAB_LAST + timedelta(hours=60)
    newer = _arnab(episode=11, todate=fresh,
                   track=ARNAB_TRACK + [{**ARNAB_TRACK[-1], "at": fresh.isoformat(), "wind_kmh": 90}])
    s4 = desk.run_desk(db, 4, _results(alerts=[newer]), fresh + timedelta(hours=3), cfg=CFG)
    assert s4["changes"] == {item: "reopened"}
    assert db.rows("desk_items")[0]["severity_reason"] == "GDACS Orange alert, 90 km/h winds (peaked at 222 km/h)"


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
