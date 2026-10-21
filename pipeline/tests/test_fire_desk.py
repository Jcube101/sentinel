"""fire_desk.py: per-state fire items from the last complete UTC day vs the seasonal norm."""
import copy
from datetime import date, datetime, timedelta, timezone
from zoneinfo import ZoneInfo

import pytest

import baseline
import fire
import fire_desk
from runs import FetchResult
from severity_config import load
from tests.fakes import FakeSupabase
from tests.test_fire import DISTRICTS, _row as _hotspot_row

# Thresholds pinned here, so retuning severity.toml doesn't break these
# mechanics tests (test_severity_config checks the repo's values).
CFG = load()
CFG["fire"].update(min_fire_events=10, level_2_min_ratio=1.25, level_3_min_ratio=2.0, calibration_cap=2,
                   level_4_min_frp_mw=100, level_4_near_km=10, level_4_min_population=100_000)
CFG["fire"]["lifecycle"].update(open_min_level=2, close_after_hours=48)
NOW = datetime(2026, 10, 21, 9, 0, tzinfo=timezone.utc)   # first run of 21 Oct: complete day = 20 Oct
DAY, TODAY = date(2026, 10, 20), date(2026, 10, 21)
NORMS = {(state, week): {"mean_daily_events": mean, "max_daily_events": 40, "years": "2024-2025"}
         for week in range(40, 46) for state, mean in (("Punjab", 10.0), ("Haryana", 0.0))}
PLACES = (("Amritsar", 31.63, 74.87, 1_100_000), ("Tarn Taran", 31.45, 74.93, 50_000))


def _cfg(**fire_overrides):
    cfg = copy.deepcopy(CFG)
    cfg["fire"].update(fire_overrides)
    return cfg


def _event(i, *, state="Punjab", district="Amritsar", did="D1", day=DAY, lat=31.5, lon=74.5, frp=5.0, hotspots=1):
    return {"id": f"FIRE-{state}-{day}-{district}-{i}", "acq_date": day.isoformat(), "state": state,
            "district": district, "district_id": did, "latitude": lat, "longitude": lon,
            "frp_max": frp, "hotspot_count": hotspots}


def _events(n, **kw):
    return [_event(i, **kw) for i in range(n)]


def _candidate(events, *, state="Punjab", today_events=(), alerts=(), cfg=CFG, norm=NORMS[("Punjab", 42)]):
    return fire_desk.state_candidate(
        state, list(events), list(today_events), norm, list(alerts), cfg=cfg, day=DAY, today=TODAY,
        places=PLACES, gdacs_checked=True, data_to=datetime(2026, 10, 20, 20, 41, tzinfo=timezone.utc))


def _wildfire(eid=1, lat=31.5, lon=74.5, current=True, kind="WF"):
    return {"id": f"GDACS-{kind}-{eid}", "eventtype": kind, "eventid": eid, "name": f"Forest fire {eid}",
            "alertlevel": "Green", "episodealertlevel": "Green", "iscurrent": current,
            "fromdate": "2026-10-19T00:00:00+00:00", "todate": "2026-10-21T00:00:00+00:00",
            "latitude": lat, "longitude": lon, "url": "https://www.gdacs.org/report"}


# --- the day, ids, places ----------------------------------------------------------------

@pytest.mark.parametrize("now, day", [
    (datetime(2026, 10, 21, 9, 0, tzinfo=timezone.utc), DAY),     # 14:30 IST run
    (datetime(2026, 10, 21, 15, 0, tzinfo=timezone.utc), DAY),    # 20:30 IST
    (datetime(2026, 10, 21, 21, 0, tzinfo=timezone.utc), DAY),    # 02:30 IST on 22 Oct: still UTC 21 Oct
    (datetime(2026, 10, 22, 2, 30, tzinfo=ZoneInfo("Asia/Kolkata")), DAY),
    (datetime(2026, 10, 22, 0, 30, tzinfo=timezone.utc), TODAY),
])
def test_complete_day_is_yesterday_utc(now, day):
    assert fire_desk.complete_day(now) == day


def test_item_ids():
    assert fire_desk.item_id("Madhya Pradesh") == "fire:madhya-pradesh"
    assert fire_desk.item_id("Dadra and Nagar Haveli and Daman and Diu") == "fire:dadra-and-nagar-haveli-and-daman-and-diu"


def test_places_file():
    places = {p[0]: p for p in fire_desk.load_places()}
    assert places["Ludhiana"][3] > 1_000_000 and places["Bathinda"][3] > 100_000
    assert sum(1 for p in places.values() if p[3] >= 100_000) > 500


def test_build_places_keeps_indian_populated_places_only():
    from tools import build_places

    def line(gid, name, code="PPL", country="IN", pop="150000"):
        f = [str(gid), name, name, "", "30.2", "74.9", "P", code, country] + [""] * 5 + [pop] + [""] * 4
        return "\t".join(f) + "\n"

    places = build_places.india_places([line(1, "Bathinda"), line(2, "Model Town", code="PPLX"),
                                        line(3, "Lahore", country="PK"), line(4, "Kasur", pop="20000")])
    assert [(p["name"], p["population"]) for p in places] == [("Bathinda", 150000), ("Kasur", 20000)]


# --- levels ---------------------------------------------------------------------------------

@pytest.mark.parametrize("events, norm, level, counted", [
    (9, 1.0, 1, False),       # 9x norm, but under the 10-event minimum
    (12, 10.0, 1, True),      # 1.2x
    (25, 20.0, 2, True),      # 1.25x
    (39, 20.0, 2, True),      # 1.95x
    (40, 20.0, 3, True),      # 2.0x
    (10, 0.0, 3, True),       # fires where the archive has none that week
    (50, None, 1, False),     # no norm for the state
])
def test_ratio_levels(events, norm, level, counted):
    got_level, _, got_counted = fire_desk.ratio_level(events, norm, CFG)
    assert (got_level, got_counted) == (level, counted)


def test_level_2_from_the_ratio():
    c = _candidate(_events(15))
    assert c.level == 2 and c.id == "fire:punjab" and c.source == "FIRMS" and c.category == "fire"
    assert c.reason == "15 fire events on 20 Oct, 1.50× the seasonal norm (10/day)"
    assert c.title == "Fire activity in 1 Punjab district"
    assert c.figures["ratio_to_norm"] == 1.5 and c.figures["capped"] is False and c.figures["week"] == 42


def test_cap_holds_firms_levels_at_2_and_says_so():
    c = _candidate(_events(30))
    assert c.level == 2
    assert c.reason == ("30 fire events on 20 Oct, 3.00× the seasonal norm (10/day)"
                        " · capped at Level 2 pending calibration (would be Level 3)")
    assert (c.figures["ratio_level"], c.figures["firms_level"], c.figures["capped"]) == (3, 3, True)

    uncapped = _candidate(_events(30), cfg=_cfg(calibration_cap=4))
    assert uncapped.level == 3 and "capped" not in uncapped.reason and uncapped.figures["capped"] is False


def test_minimum_fire_count_before_the_ratio_counts():
    c = _candidate(_events(8), norm={"mean_daily_events": 0.5, "max_daily_events": 3, "years": "2024-2025"})
    assert c.level == 1 and c.figures["ratio_counted"] is False and c.figures["ratio_to_norm"] == 16.0
    assert c.reason == "8 fire events on 20 Oct, too few to compare with the norm (minimum 10)"


def test_zero_norm():
    c = _candidate(_events(10, state="Haryana", district="Karnal", did="D2"), state="Haryana",
                   norm=NORMS[("Haryana", 42)])
    assert c.level == 2 and c.figures["ratio_to_norm"] is None and c.figures["firms_level"] == 3
    assert c.reason.startswith("10 fire events on 20 Oct; none in this week in 2024–2025 · capped at Level 2")


def test_large_fire_near_a_city_is_level_4_but_capped():
    big = _event(99, lat=31.60, lon=74.85, frp=150.0)   # ~4 km from Amritsar (1.1 million)
    c = _candidate(_events(3) + [big])
    assert c.level == 2 and c.figures["firms_level"] == 4
    assert "large fire (150 MW) 3.8 km from Amritsar" in c.reason and c.reason.endswith("(would be Level 4)")
    assert c.figures["large_fires_near_people"][0]["place"] == "Amritsar"
    assert _candidate([big], cfg=_cfg(calibration_cap=4)).level == 4


@pytest.mark.parametrize("event", [
    _event(1, lat=31.46, lon=74.93, frp=150.0),   # next to Tarn Taran, only 50,000 people
    _event(2, lat=31.60, lon=74.85, frp=90.0),    # near Amritsar, but under 100 MW
    _event(3, lat=31.40, lon=74.20, frp=300.0),   # big, but 60+ km from Amritsar
])
def test_no_level_4(event):
    assert _candidate([event], cfg=_cfg(calibration_cap=4)).figures["firms_level"] == 1


def test_gdacs_wildfire_lifts_past_the_cap():
    alert = {"id": "GDACS-WF-1", "name": "Forest fire 1", "alert_level": "Green", "url": "u", "from": None, "to": None}
    c = _candidate(_events(3), alerts=[alert])
    assert c.level == 3 and c.figures["gdacs_level"] == 3 and not c.figures["capped"]
    assert c.reason == ("Forest fire: GDACS Green wildfire alert (Forest fire 1); "
                        "3 fire events on 20 Oct, too few to compare with the norm (minimum 10)")
    no_events = _candidate([], alerts=[alert])
    assert no_events.level == 3 and no_events.title == "Forest fire in Punjab" and no_events.latitude is None


def test_wildfire_alerts_located_in_states():
    alerts = [_wildfire(1), _wildfire(2, lat=29.5, lon=76.5), _wildfire(3, current=False),
              _wildfire(4, lat=25.0, lon=70.0), _wildfire(5, kind="FL")]
    by_state, unmatched = fire_desk.wildfire_alerts_by_state(alerts, DISTRICTS, CFG)
    assert {s: [a["id"] for a in v] for s, v in by_state.items()} == {"Punjab": ["GDACS-WF-1"], "Haryana": ["GDACS-WF-2"]}
    assert unmatched == 1


def test_partial_today_is_in_figures_only():
    c = _candidate(_events(2), today_events=_events(100, day=TODAY))
    assert c.level == 1
    assert c.figures["today"] == {"date": "2026-10-21", "partial": True, "fire_events": 100, "hotspots": 100,
                                  "district_count": 1}
    assert c.figures["fire_events"] == 2 and c.figures["day"] == "2026-10-20"


def test_districts_listed_busiest_first():
    events = _events(2, district="Tarn Taran", did="D9") + _events(5) + [_event(9, district="Moga", did="D7", frp=12.5)]
    c = _candidate(events)
    assert c.title == "Fire activity in 3 Punjab districts"
    assert [(d["district"], d["fire_events"]) for d in c.figures["districts"]] == [
        ("Amritsar", 5), ("Tarn Taran", 2), ("Moga", 1)]
    assert c.figures["districts"][2]["frp_max"] == 12.5


# --- the stage: lifecycle against a fake Supabase ---------------------------------------------------

def _results(day=DAY, firms_status="ok", alerts=(), gdacs_status="ok", day_data=True):
    acq = day if day_data else day + timedelta(days=1)
    firms_rows = [{"id": "FIRMS-a", "started_at": f"{acq}T20:41:00+00:00", "raw": {"acq_date": acq.isoformat()}},
                  {"id": "FIRMS-b", "started_at": f"{acq}T08:05:00+00:00", "raw": {"acq_date": acq.isoformat()}}]
    return {"FIRMS": FetchResult("FIRMS", firms_rows, True, firms_status, None, 0.1),
            "GDACS": FetchResult("GDACS", [], True, gdacs_status, None, 0.1, {"alerts": list(alerts)})}


def _run(db, rows, *, now=NOW, run_id=5, write=True, cfg=CFG, **results_kw):
    day = fire_desk.complete_day(now)
    return fire_desk.run_fire_desk(db, run_id, _results(day=day, **results_kw), now, rows=rows, write=write,
                                   cfg=cfg, norms=NORMS, districts=DISTRICTS, places=PLACES)


def _item(db, item_id="fire:punjab"):
    (row,) = [r for r in db.rows("desk_items") if r["id"] == item_id]
    return row


def _snap(db, run_id, item_id="fire:punjab"):
    (row,) = [r for r in db.rows("desk_item_snapshots") if (r["run_id"], r["item_id"]) == (run_id, item_id)]
    return row


def _day(n):
    """Run time n days after NOW (same hour), and that run's complete day."""
    now = NOW + timedelta(days=n)
    return now, fire_desk.complete_day(now)


def test_opens_at_level_2_and_level_1_states_stay_off_the_desk():
    db = FakeSupabase()
    rows = _events(15) + _events(3, state="Haryana", district="Karnal", did="D2")   # Haryana: under the minimum
    summary = _run(db, rows, run_id=5)
    assert [r["id"] for r in db.rows("desk_items")] == ["fire:punjab"]
    item = _item(db)
    assert (item["status"], item["severity_level"], item["source"], item["place_name"]) == ("open", 2, "FIRMS", "Punjab")
    assert item["observed_at"] == "2026-10-20T20:41:00+00:00"
    assert _snap(db, 5)["change"] == "opened"
    assert summary["open"] == ["Punjab L2"] and summary["day"] == "2026-10-20" and summary["assessed"] == 2
    assert summary["top_ratios"] == ["Punjab 15/10.0 = 1.50x"]


def test_later_runs_on_the_same_day_are_not_new_data():
    db = FakeSupabase()
    _run(db, _events(15), run_id=5)
    _run(db, _events(15) + _events(40, day=TODAY), run_id=6, now=NOW + timedelta(hours=6))
    snap = _snap(db, 6)
    assert snap["change"] is None and snap["new_data"] is False
    assert snap["figures"]["today"]["fire_events"] == 40 and snap["severity_level"] == 2


def test_closes_after_two_complete_days_below_level_2():
    db = FakeSupabase()
    _run(db, _events(15), run_id=5)                                        # 20 Oct: 1.5x, opens

    now, day = _day(1)
    _run(db, _events(5, day=day), now=now, run_id=6)                       # 21 Oct: under the minimum
    item = _item(db)
    assert (item["status"], item["severity_level"]) == ("open", 1)
    assert item["figures"]["quiet_since"] == "2026-10-21" and _snap(db, 6)["change"] == "deescalated"

    now, day = _day(2)
    _run(db, [], now=now, run_id=7)                                        # 22 Oct: no fire events
    item = _item(db)
    assert item["status"] == "closed" and _snap(db, 7)["change"] == "closed"
    assert item["severity_reason"] == "No fire events on 22 Oct" and item["title"] == "No fire activity in Punjab"


def test_back_above_level_2_resets_the_quiet_clock():
    db = FakeSupabase()
    _run(db, _events(15), run_id=5)
    now, day = _day(1)
    _run(db, _events(5, day=day), now=now, run_id=6)
    now, day = _day(2)
    _run(db, _events(16, day=day), now=now, run_id=7)
    assert _item(db)["figures"]["quiet_since"] is None and _snap(db, 7)["change"] == "escalated"
    now, day = _day(3)
    _run(db, _events(4, day=day), now=now, run_id=8)
    item = _item(db)
    assert item["status"] == "open" and item["figures"]["quiet_since"] == "2026-10-23"


def test_closed_item_reopens():
    db = FakeSupabase()
    _run(db, _events(15), run_id=5)
    for n, run_id in ((1, 6), (2, 7)):
        now, day = _day(n)
        _run(db, [], now=now, run_id=run_id)
    assert _item(db)["status"] == "closed"
    now, day = _day(3)
    _run(db, _events(20, day=day), now=now, run_id=8)
    assert _item(db)["status"] == "open" and _snap(db, 8)["change"] == "reopened"


@pytest.mark.parametrize("kw, note", [
    ({"firms_status": "timeout"}, "FIRMS fetch failed this run"),
    ({"firms_status": "empty"}, "FIRMS returned no hotspots this run"),
    ({"day_data": False}, "no FIRMS data for 21 Oct in this run"),
])
def test_no_new_level_when_firms_data_is_missing(kw, note):
    db = FakeSupabase()
    _run(db, _events(15), run_id=5)
    now, _ = _day(1)
    summary = _run(db, [], now=now, run_id=6, **kw)
    item = _item(db)
    assert item["status"] == "open" and item["last_known"] is True and item["severity_level"] == 2
    assert item["severity_reason"].endswith(f" · last known: {note}")
    assert summary["source_good"] is False and summary["note"] == note and summary["open"] == ["Punjab L2 last-known"]


def test_gdacs_alert_opens_an_item_and_survives_a_gdacs_outage():
    db = FakeSupabase()
    _run(db, _events(3), run_id=5, alerts=[_wildfire(1)])
    item = _item(db)
    assert item["severity_level"] == 3 and item["figures"]["gdacs_wildfire"][0]["id"] == "GDACS-WF-1"

    _run(db, _events(3), run_id=6, now=NOW + timedelta(hours=6), gdacs_status="error")
    item = _item(db)
    assert item["severity_level"] == 3 and item["figures"]["gdacs_checked"] is False
    assert _snap(db, 6)["change"] is None

    _run(db, _events(3), run_id=7, now=NOW + timedelta(hours=12))          # GDACS back, alert gone
    item = _item(db)
    assert item["severity_level"] == 1 and item["status"] == "open" and item["figures"]["gdacs_wildfire"] == []


def test_dry_run_writes_nothing_and_tolerates_a_missing_table():
    db = FakeSupabase(missing={"desk_items"})
    summary = _run(db, _events(15), write=False)
    assert summary["open"] == ["Punjab L2"]
    assert [c for c in db.calls if c[1] != "select"] == []


def test_rows_rebuilt_from_firms_when_the_fire_stage_failed():
    # 15 separate fires (2 km apart) in the test Amritsar square on 20 Oct.
    hotspots = [_hotspot_row(31.1 + i * 0.02, 74.5, acq_date="2026-10-20") for i in range(15)]
    results = {"FIRMS": FetchResult("FIRMS", hotspots, True, "ok", None, 0.1),
               "GDACS": FetchResult("GDACS", [], True, "ok", None, 0.1, {"alerts": []})}
    db = FakeSupabase()
    fire_desk.run_fire_desk(db, 5, results, NOW, rows=None, cfg=CFG, norms=NORMS, districts=DISTRICTS, places=PLACES)
    assert _item(db)["figures"]["fire_events"] == 15
    assert not [c for c in db.calls if c[0] == "fire_events" and c[1] != "select"]   # rebuilt, not rewritten


def test_real_baseline_has_a_norm_for_every_state_and_week():
    norms = baseline.load()
    states = {p["state"] for p in fire.Districts.india().props}
    assert all((s, w) in norms for s in states for w in range(1, 53))


def test_repo_thresholds_min_25_and_2x_4x():
    repo = load()
    norm = {"mean_daily_events": 10.0, "max_daily_events": 40, "years": "2024-2025"}
    level = lambda n, mean=10.0: _candidate(_events(n), cfg=repo, norm={**norm, "mean_daily_events": mean})
    assert level(24).level == 1                                      # 2.4x, but under 25 events
    assert level(30, mean=20.0).level == 1                           # 1.5x
    assert level(25).level == 2 and level(39).level == 2             # 2.5x, 3.9x
    assert level(40).level == 2 and level(40).figures["firms_level"] == 3   # 4x, capped at 2


# --- watching (step 7) ------------------------------------------------------------------------

def test_watch_subjects_cover_every_state_with_a_norm():
    norm = lambda mean: {"mean_daily_events": mean, "max_daily_events": 90, "years": "2024-2025"}
    norms = {("Punjab", 42): norm(20.0), ("Haryana", 42): norm(8.0), ("Kerala", 42): norm(1.0),
             ("India", 42): norm(29.0), ("Punjab", 43): norm(50.0)}
    punjab = _candidate(_events(22), norm=norms[("Punjab", 42)])                   # 1.1x: Level 1
    haryana = _candidate(_events(12, state="Haryana", district="Karnal", did="D2"), state="Haryana",
                         norm=norms[("Haryana", 42)])                              # 1.5x: Level 2
    items = [{"id": "fire:haryana", "status": "open"}]
    subjects = {s.title: s for s in fire_desk.watch_subjects([punjab, haryana], items, norms, cfg=CFG, day=DAY,
                                                            data_to=NOW)}
    assert sorted(subjects) == ["Haryana", "Kerala", "Punjab"]                     # not the national row
    p = subjects["Punjab"]
    assert (p.id, p.level, p.next_level, p.value, p.threshold, p.item_id) == ("fire:punjab", 1, 2, 22, 25, None)
    assert p.metric == "fire events on 20 Oct; Level 2 needs 1.25× the norm (20/day) and at least 10"
    h = subjects["Haryana"]
    assert (h.level, h.next_level, h.threshold, h.item_id) == (2, None, None, "fire:haryana")  # cap 2: no FIRMS route up
    k = subjects["Kerala"]
    assert (k.value, k.threshold) == (0, 10)                                       # the minimum count binds
    uncapped = {s.title: s for s in fire_desk.watch_subjects([haryana], [], norms, cfg=_cfg(calibration_cap=4),
                                                            day=DAY, data_to=NOW)}
    assert (uncapped["Haryana"].next_level, uncapped["Haryana"].threshold) == (3, 16)   # 2x the norm of 8


def test_run_fire_desk_hands_over_items_and_watch_subjects():
    db = FakeSupabase()
    s = _run(db, _events(15), run_id=5)
    assert [i["id"] for i in s["items"]] == ["fire:punjab"]
    assert {w.title for w in s["watch"]} == {"Punjab", "Haryana"}
    now, _ = _day(1)
    assert _run(db, [], now=now, run_id=6, firms_status="timeout")["watch"] == []
