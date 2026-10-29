"""air.py with the data.gov.in feed: CPCB city AQI, the Severe guard, fallback to OpenAQ, freshness."""
import copy
from datetime import datetime, timedelta, timezone

import pytest

import air
import datagov
import watch
from runs import FetchResult
from severity_config import load
from tests.fakes import FakeSupabase
from tests.test_air import STATIONS, FakeOpenAQ

NOW = datetime(2026, 10, 21, 14, 0, tzinfo=timezone.utc)      # 19:30 IST
SNAPSHOT = "21-10-2026 19:00:00"                               # 13:30 UTC, half an hour old
CFG = load()
CFG["air"]["min_fresh_cities"] = 2
CFG["air"]["severe_confirm_runs"] = 2


def _station(name, city, subs, state="Delhi", updated=SNAPSHOT, lat="28.6", lon="77.2"):
    return [{"country": "India", "state": state, "city": city, "station": name, "last_update": updated,
             "latitude": lat, "longitude": lon, "pollutant_id": p, "min_value": "1", "max_value": "500",
             "avg_value": str(v)} for p, v in subs.items()]


def _feed(*cities, updated=SNAPSHOT):
    """cities: (city, [station AQIs]); each station reports PM2.5 at that AQI plus two lower pollutants."""
    records = []
    for city, aqis in cities:
        for i, aqi in enumerate(aqis):
            records += _station(f"Site {i}, {city} - PCB", city, {"PM2.5": aqi, "NO2": 20, "CO": 15}, updated=updated)
    return records


def _at(now):
    """The feed's snapshot stamp half an hour before a run at `now` (IST, as the feed writes it)."""
    return (now - timedelta(minutes=30)).astimezone(datagov.IST).strftime("%d-%m-%Y %H:%M:%S")


def _feed_fn(records, made=4):
    return lambda: (records, made)


def _failing_feed(message="HTTP 502 (3 tries, offset 0)", status="error"):
    def feed():
        raise datagov.FeedError(message, status=status)
    return feed


def _results(openaq_status="ok"):
    return {"OpenAQ": FetchResult("OpenAQ", [], True, openaq_status, None, 0.1, extras={"locations": []})}


def _db():
    return FakeSupabase({"sources": [{"id": "DATAGOV", "newest_observation_at": None}, {"id": "OPENAQ"}]})


CLEAN = ("Pune", [60]), ("Chennai", [70])


# --- CPCB city AQI from the feed ------------------------------------------------------------

def test_city_aqi_is_the_mean_of_station_aqis():
    records = _feed(("Delhi", [301, 300]), ("Noida", [250]), *CLEAN)
    records += _station("Mandir Marg, New Delhi - NDMC", "New Delhi", {"PM10": 302, "NO2": 30, "SO2": 5})
    records += _station("Thin, Delhi - DPCC", "Delhi", {"PM2.5": 480, "NO2": 30})          # 2 pollutants: no AQI
    f = air.assess_feed(records, CFG, NOW, 4)
    delhi = next(c for c in f["cities"] if c["city"] == "Delhi")
    # New Delhi is an alias of Delhi; (301 + 300 + 302) / 3 = 301 -> Very poor
    assert (delhi["aqi"], delhi["band"], delhi["stations"], delhi["prominent"]) == (301, "very_poor", 3, ["PM2.5"])
    assert f["counts"] == {"severe": 0, "very_poor": 1, "poor": 1}
    assert f["stations_listed"] == 7 and f["stations_reporting"] == 6 and f["cities_reporting"] == 4
    assert f["source"] == "datagov" and f["approximate"] is False and f["unvalidated"] is True
    assert f["snapshot_at"] == "2026-10-21T19:00:00+05:30" and f["snapshot_age_hours"] == 0.5
    assert [c["city"] for c in f["worst_cities"]] == ["Delhi", "Noida", "Chennai", "Pune"]


def test_city_position_is_the_mean_of_its_counted_stations():
    records = (_station("A, Delhi - DPCC", "Delhi", {"PM2.5": 320, "NO2": 30, "CO": 10}, lat="28.60", lon="77.20")
               + _station("B, Delhi - DPCC", "Delhi", {"PM2.5": 300, "NO2": 30, "CO": 10}, lat="28.70", lon="77.30")
               # no AQI (two pollutants): not counted, so not in the position either
               + _station("C, Delhi - DPCC", "Delhi", {"PM2.5": 400, "NO2": 30}, lat="29.90", lon="78.90")
               # coordinates outside India (a swapped pair): counted for the AQI, not the position
               + _station("D, Delhi - DPCC", "Delhi", {"PM2.5": 310, "NO2": 30, "CO": 10}, lat="77.25", lon="28.65")
               + _station("E, Agra - UPPCB", "Agra", {"PM2.5": 250, "NO2": 30, "CO": 10}, lat="NA", lon="")
               + _feed(*CLEAN))
    f = air.assess_feed(records, CFG, NOW, 4)
    by_city = {c["city"]: c for c in f["cities"]}
    assert (by_city["Delhi"]["latitude"], by_city["Delhi"]["longitude"], by_city["Delhi"]["stations"]) == (28.65, 77.25, 3)
    assert (by_city["Agra"]["latitude"], by_city["Agra"]["longitude"]) == (None, None)


@pytest.mark.parametrize("aqi, band", [(200, None), (201, "poor"), (300, "poor"), (301, "very_poor"),
                                       (400, "very_poor"), (401, "severe")])
def test_cpcb_categories(aqi, band):
    assert air.aqi_band(aqi, CFG) == band


# --- the Severe guard ----------------------------------------------------------------------------

def test_severe_counts_only_after_two_runs_in_a_row():
    db = _db()
    severe = lambda now: _feed(("Khora", [420]), ("Delhi", [310]), *CLEAN, updated=_at(now))
    s1 = air.run_air(db, 1, _results(), NOW, cfg=CFG, feed=_feed_fn(severe(NOW)))
    assert s1["level"] == 2 and s1["severe_unconfirmed"] == ["Khora"]
    assert s1["reason"] == ("Very poor in Khora, Delhi (CPCB AQI, real-time (unvalidated); to 21 Oct, 19:00 IST)"
                            " · Severe in Khora not yet confirmed (needs 2 runs in a row)")
    item = db.rows("desk_items")[0]
    assert item["figures"]["severe_streaks"] == {"Khora": 1} and item["source"] == "DATAGOV"

    later = NOW + timedelta(hours=6)
    s2 = air.run_air(db, 2, _results(), later, cfg=CFG, feed=_feed_fn(severe(later)))
    assert s2["level"] == 3 and s2["severe_unconfirmed"] == [] and s2["change"] == "escalated"
    assert s2["reason"].startswith("Severe in Khora (CPCB AQI, real-time (unvalidated)")

    later = NOW + timedelta(hours=12)
    calmer = _feed(("Khora", [380]), ("Delhi", [310]), *CLEAN, updated=_at(later))
    s3 = air.run_air(db, 3, _results(), later, cfg=CFG, feed=_feed_fn(calmer))
    assert s3["level"] == 2 and db.rows("desk_items")[0]["figures"]["severe_streaks"] == {}
    later = NOW + timedelta(hours=18)
    s4 = air.run_air(db, 4, _results(), later, cfg=CFG, feed=_feed_fn(severe(later)))
    assert s4["level"] == 2 and s4["severe_unconfirmed"] == ["Khora"]          # the streak starts again


def test_a_run_without_an_assessment_does_not_break_the_streak():
    db = _db()
    severe = lambda now: _feed(("Khora", [420]), *CLEAN, updated=_at(now))
    air.run_air(db, 1, _results(), NOW, cfg=CFG, feed=_feed_fn(severe(NOW)))
    down = air.run_air(db, 2, _results("error"), NOW + timedelta(hours=6), cfg=CFG, feed=_failing_feed())
    assert down["source_good"] is False and db.rows("desk_items")[0]["last_known"] is True
    later = NOW + timedelta(hours=12)
    s3 = air.run_air(db, 3, _results(), later, cfg=CFG, feed=_feed_fn(severe(later)))
    assert s3["level"] == 3


def test_very_poor_counts_at_once():
    s = air.run_air(_db(), 1, _results(), NOW, cfg=CFG, feed=_feed_fn(_feed(("Delhi", [350]), *CLEAN)))
    assert s["level"] == 2 and s["severe_unconfirmed"] == []


def test_guard_also_applies_to_the_openaq_fallback(monkeypatch):
    monkeypatch.setattr(air, "reference_stations", lambda locations, cfg: STATIONS[:1])
    cfg = copy.deepcopy(CFG)
    cfg["air"]["min_fresh_cities"] = 1
    s = air.run_air(_db(), 1, _results(), NOW, cfg=cfg, feed=_failing_feed(),
                    client=FakeOpenAQ({11: (300, 1)}, {11: [300] * 24}))
    assert s["level"] == 2 and s["severe_unconfirmed"] == ["Delhi"] and "approx. CPCB band" in s["reason"]


# --- source choice and fallback ----------------------------------------------------------------

def test_good_feed_sets_the_level_without_openaq():
    db = _db()
    openaq = FakeOpenAQ({11: (300, 1)}, {11: [300] * 24})
    s = air.run_air(db, 1, _results(), NOW, cfg=CFG, feed=_feed_fn(_feed(("Delhi", [250]), *CLEAN)), client=openaq)
    assert (s["source"], s["source_id"], s["source_status"], s["level"]) == ("data.gov.in", "DATAGOV", "ok", 1)
    assert openaq.requests == 0 and s["requests"] == 4 and s["fallback_reason"] is None
    assert s["reason"] == "Poor in Delhi (CPCB AQI, real-time (unvalidated); to 21 Oct, 19:00 IST)"
    item = db.rows("desk_items")[0]
    assert item["source"] == "DATAGOV" and item["figures"]["approximate"] is False
    assert item["observed_at"] == "2026-10-21T19:00:00+05:30"


@pytest.mark.parametrize("feed, why", [
    (_failing_feed(), "data.gov.in feed failed (HTTP 502 (3 tries, offset 0))"),
    (_feed_fn(_feed(("Delhi", [250]), *CLEAN, updated="21-10-2026 12:00:00")),
     "data.gov.in snapshot is 8 h old (max 6 h)"),
    (_feed_fn(_feed(("Delhi", [250]))), "data.gov.in: only 1 city has a CPCB AQI (need 2)"),
])
def test_fallback_to_openaq(monkeypatch, feed, why):
    monkeypatch.setattr(air, "reference_stations", lambda locations, cfg: STATIONS[:3])   # Delhi x2, Lucknow
    db = _db()
    s = air.run_air(db, 1, _results(), NOW, cfg=CFG, feed=feed,
                    client=FakeOpenAQ({11: (100, 1), 21: (100, 1), 31: (100, 1)},
                                      {11: [100] * 24, 21: [100] * 24, 31: [100] * 24}))
    assert (s["source"], s["source_id"], s["fallback_reason"]) == ("OpenAQ", "OPENAQ", why)
    assert "approx. CPCB band" in s["reason"] and "unvalidated" not in s["reason"]
    item = db.rows("desk_items")[0]
    assert item["source"] == "OPENAQ" and item["figures"]["fallback_reason"] == why


def _openaq(pm25=100, age=1, now=None):
    """OpenAQ fallback data: PM2.5 24 h means (100 µg/m³ is Poor) at Delhi x2 and Lucknow,
    newest reading `age` hours before `now` (default: test_air's NOW, a day before this file's)."""
    sensors = (11, 21, 31)
    return FakeOpenAQ({s: (pm25, age) for s in sensors}, {s: [pm25] * 24 for s in sensors},
                      **({"now": now} if now else {}))


def test_item_opened_under_openaq_takes_datagov_once_the_feed_sets_the_level(monkeypatch):
    monkeypatch.setattr(air, "reference_stations", lambda locations, cfg: STATIONS[:3])
    db = _db()
    s1 = air.run_air(db, 1, _results(), NOW, cfg=CFG, feed=_failing_feed(), client=_openaq())
    assert s1["source_id"] == "OPENAQ" and db.rows("desk_items")[0]["source"] == "OPENAQ"

    later = NOW + timedelta(hours=6)
    s2 = air.run_air(db, 2, _results(), later, cfg=CFG,
                     feed=_feed_fn(_feed(("Delhi", [350]), *CLEAN, updated=_at(later))))
    item = db.rows("desk_items")[0]
    assert s2["source_id"] == "DATAGOV" and s2["change"] == "escalated"
    assert item["source"] == "DATAGOV" and item["first_run_id"] == 1 and item["last_known"] is False
    assert item["severity_reason"].startswith("Very poor in Delhi (CPCB AQI, real-time (unvalidated)")


def test_item_opened_under_datagov_takes_openaq_when_the_fallback_sets_the_level(monkeypatch):
    monkeypatch.setattr(air, "reference_stations", lambda locations, cfg: STATIONS[:3])
    db = _db()
    air.run_air(db, 1, _results(), NOW, cfg=CFG, feed=_feed_fn(_feed(("Delhi", [350]), *CLEAN)))
    assert db.rows("desk_items")[0]["source"] == "DATAGOV"

    later = NOW + timedelta(hours=6)  # OpenAQ data newer than the feed's level
    s2 = air.run_air(db, 2, _results(), later, cfg=CFG, feed=_failing_feed(), client=_openaq(now=later))
    item = db.rows("desk_items")[0]
    assert s2["source_id"] == "OPENAQ" and s2["change"] == "deescalated"
    assert item["source"] == "OPENAQ" and item["first_run_id"] == 1 and item["last_known"] is False
    assert "approx. CPCB band" in item["severity_reason"] and "unvalidated" not in item["severity_reason"]


def _feed_level_then_feed_fails(monkeypatch, openaq):
    """Run 1: the feed sets Level 1 (Poor in Delhi, data to 21 Oct, 19:00 IST). Run 2, 6 h later: it fails."""
    monkeypatch.setattr(air, "reference_stations", lambda locations, cfg: STATIONS[:3])
    db = _db()
    air.run_air(db, 1, _results(), NOW, cfg=CFG, feed=_feed_fn(_feed(("Delhi", [250]), *CLEAN)))
    s = air.run_air(db, 2, _results(), NOW + timedelta(hours=6), cfg=CFG, feed=_failing_feed(), client=openaq)
    return s, db.rows("desk_items")[0]


def test_fallback_data_older_than_the_current_level_keeps_it_last_known(monkeypatch):
    """Edition 21: OpenAQ's newest data was 3 days older than the feed's level, and escalated it."""
    openaq = _openaq(pm25=130, age=30, now=NOW + timedelta(hours=6))     # Very poor, to 20 Oct, 19:30 IST
    s, item = _feed_level_then_feed_fails(monkeypatch, openaq)
    assert s["source_good"] is False and s["change"] is None and openaq.history_calls == []
    assert item["severity_level"] == 1 and item["source"] == "DATAGOV" and item["last_known"] is True
    assert item["severity_reason"].endswith(
        "· last known: data.gov.in feed failed (HTTP 502 (3 tries, offset 0)); "
        "OpenAQ data runs to 20 Oct, 19:30 IST, older than the current level (21 Oct, 19:00 IST)")


def test_fallback_data_newer_than_the_current_level_sets_it(monkeypatch):
    openaq = _openaq(pm25=130, age=1, now=NOW + timedelta(hours=6))      # Very poor, to 22 Oct, 00:30 IST
    s, item = _feed_level_then_feed_fails(monkeypatch, openaq)
    assert s["source_good"] is True and s["change"] == "escalated" and openaq.history_calls
    assert item["severity_level"] == 2 and item["source"] == "OPENAQ" and item["last_known"] is False
    assert item["severity_reason"] == "Very poor in Delhi, Lucknow (approx. CPCB band; 24 h mean to 22 Oct, 00:30 IST)"


def test_both_sources_down_keeps_last_known_and_says_why():
    db = _db()
    air.run_air(db, 1, _results(), NOW, cfg=CFG, feed=_feed_fn(_feed(("Delhi", [250]), *CLEAN)))
    s = air.run_air(db, 2, _results("error"), NOW + timedelta(hours=6), cfg=CFG, feed=_failing_feed())
    assert s["note"] == "data.gov.in feed failed (HTTP 502 (3 tries, offset 0)); OpenAQ fetch failed this run"
    item = db.rows("desk_items")[0]
    assert item["last_known"] is True and item["severity_level"] == 1 and item["source"] == "DATAGOV"
    assert item["severity_reason"].endswith("· last known: data.gov.in feed failed (HTTP 502 (3 tries, offset 0)); "
                                            "OpenAQ fetch failed this run")


# --- freshness of the DATAGOV source ---------------------------------------------------------------

def test_feed_attempt_is_recorded_on_the_datagov_source():
    db = _db()
    s = air.run_air(db, 7, _results(), NOW, cfg=CFG, feed=_feed_fn(_feed(("Delhi", [250]), *CLEAN)))
    row = next(r for r in db.rows("sources") if r["id"] == "DATAGOV")
    assert (row["last_status"], row["last_run_id"], row["last_error"]) == ("ok", 7, None)
    assert row["newest_observation_at"] == "2026-10-21T19:00:00+05:30" and row["last_row_count"] == 9
    assert s["datagov"]["new_data"] is True and s["datagov"]["status"] == "ok"

    air.run_air(db, 8, _results(), NOW, cfg=CFG, feed=_failing_feed("timed out after 60 s (3 tries, offset 0)",
                                                                     status="timeout"))
    row = next(r for r in db.rows("sources") if r["id"] == "DATAGOV")
    assert row["last_status"] == "timeout" and row["last_success_at"] and "timed out" in row["last_error"]
    assert row["newest_observation_at"] == "2026-10-21T19:00:00+05:30"


def test_dry_run_records_nothing():
    db = _db()
    s = air.run_air(db, None, _results(), NOW, cfg=CFG, write=False, feed=_feed_fn(_feed(("Delhi", [250]), *CLEAN)))
    assert s["level"] == 1 and s["datagov"] is None
    assert not [c for c in db.calls if c[1] != "select"]


# --- watching and category status ----------------------------------------------------------------

def test_watch_subject_on_the_aqi_scale():
    s = air.run_air(_db(), 1, _results(), NOW, cfg=CFG, feed=_feed_fn(_feed(("Delhi", [290]), *CLEAN)))
    (subject,) = s["watch"]
    assert (subject.level, subject.next_level, subject.value, subject.threshold) == (1, 2, 290, 300)
    assert subject.metric == "CPCB AQI in Delhi, the worst city; Very poor starts above 300"

    s = air.run_air(_db(), 1, _results(), NOW, cfg=CFG, feed=_feed_fn(_feed(("Khora", [420]), *CLEAN)))
    row = watch.update_row(s["watch"][0], None, CFG, NOW, 1)
    assert row["watching"] is True and row["next_level"] == 3      # Severe, waiting for confirmation
    assert row["watch_reason"] == "past the Level 3 threshold (400), not yet at that level"


def test_category_status_names_the_source_that_set_the_level():
    s = air.run_air(_db(), 1, _results(), NOW, cfg=CFG, feed=_feed_fn(_feed(("Delhi", [250]), *CLEAN)))
    status = watch.category_status("air", s["items"], results=_results(), stage=s, cfg=CFG, watching=0,
                                   run_id=1, now=NOW)
    assert (status["source"], status["source_status"], status["level"]) == ("DATAGOV", "ok", 1)
