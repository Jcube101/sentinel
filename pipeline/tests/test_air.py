"""air.py: station cities, CPCB bands, 24 h means, sampling, lifecycle."""
import copy
from datetime import datetime, timedelta, timezone
from types import SimpleNamespace

import pytest

import air
from runs import FetchResult
from severity_config import load
from tests.fakes import FakeSupabase

NOW = datetime(2026, 10, 20, 15, 0, tzinfo=timezone.utc)
REAL_CFG = load()
CFG = copy.deepcopy(REAL_CFG)
CFG["air"]["min_fresh_cities"] = 1  # most tests use a handful of cities
CFG["air"]["severe_confirm_runs"] = 1  # the Severe guard has its own tests (test_air_datagov.py)
ALIASES = {"New Delhi": "Delhi"}


# --- station names -----------------------------------------------------------------

@pytest.mark.parametrize("name, provider, city", [
    ("R K Puram, Delhi - DPCC", "CPCB", "Delhi"),
    ("Mandir Marg, New Delhi - DPCC", "CPCB", "Delhi"),          # alias
    ("Sector - 125, Noida, UP - UPPCB", "CPCB", "Noida"),        # state code dropped
    ("Tata Stadium - Jorapokhar - JSPCB", "CPCB", "Jorapokhar"),
    ("Talkatora District Industries Center, Lucknow - CPCB", "CPCB", "Lucknow"),
    ("New Delhi", "AirNow", "Delhi"),
    ("Mumbai", "AirNow", "Mumbai"),
    ("", "CPCB", None),
])
def test_station_city(name, provider, city):
    assert air.station_city(name, provider, ALIASES) == city


def _location(lid, name, provider="CPCB", pm25=(), pm10=(), other=()):
    sensors = ([{"id": s, "parameter": {"name": "pm25"}} for s in pm25]
               + [{"id": s, "parameter": {"name": "pm10"}} for s in pm10]
               + [{"id": s, "parameter": {"name": "no2"}} for s in other])
    return {"id": lid, "name": name, "provider": {"name": provider}, "sensors": sensors}


def test_reference_stations_filters_providers_and_pm_sensors():
    locations = [
        _location(1, "R K Puram, Delhi - DPCC", pm25=[11], pm10=[12], other=[13]),
        _location(2, "Koramangala", provider="AirGradient", pm25=[21]),
        _location(3, "NO2 only, Pune - MPCB", other=[31]),
    ]
    (st,) = air.reference_stations(locations, CFG)
    assert st["city"] == "Delhi" and st["sensors"] == {"pm25": [11], "pm10": [12]}


# --- bands and level ------------------------------------------------------------------

@pytest.mark.parametrize("pollutant, value, expected", [
    ("pm25", 90, None), ("pm25", 90.1, "poor"), ("pm25", 120.5, "very_poor"),
    ("pm25", 250.1, "severe"), ("pm10", 250, None), ("pm10", 351, "very_poor"), ("pm10", 431, "severe"),
    ("pm25", None, None),
])
def test_band(pollutant, value, expected):
    assert air.band(pollutant, value, CFG) == expected


def test_worst_band():
    assert air.worst("poor", None, "severe") == "severe"
    assert air.worst(None, None) is None


@pytest.mark.parametrize("severe, very_poor, poor, level", [
    (3, 0, 0, 4), (5, 2, 1, 4), (1, 0, 0, 3), (2, 9, 9, 3), (0, 1, 0, 2), (0, 0, 4, 1), (0, 0, 0, None),
])
def test_air_level(severe, very_poor, poor, level):
    assert air.air_level({"severe": severe, "very_poor": very_poor, "poor": poor}, CFG) == level


def test_spread_sample():
    assert air.spread_sample([3, 1, 2], 5, key=lambda x: x) == [3, 1, 2]
    assert air.spread_sample(list(range(10)), 3, key=lambda x: x) == [0, 4, 9]  # cleanest, middle, dirtiest
    assert air.spread_sample(list(range(9)), 1, key=lambda x: x) == [4]


# --- assess with a fake OpenAQ ----------------------------------------------------------

class FakeOpenAQ(air.OpenAQ):
    """latest: sensor -> (value, hours before `now`); hours: sensor -> list of hourly values."""

    def __init__(self, latest, hours, fail=(), now=NOW):
        super().__init__(get=None, sleep=lambda s: None)
        self.latest, self.hours, self.fail, self.now = latest, hours, set(fail), now
        self.history_calls = []

    def get(self, path, params):
        self.requests += 1
        if path.startswith("/parameters/"):
            rows = [{"sensorsId": sid, "value": v,
                     "datetime": {"utc": (self.now - timedelta(hours=age)).isoformat()}}
                    for sid, (v, age) in self.latest.items()] if params["page"] == 1 else []
            return {"results": rows}
        sid = int(path.split("/")[2])
        self.history_calls.append(sid)
        if sid in self.fail:
            raise RuntimeError("500")
        return {"results": [{"value": v} for v in self.hours.get(sid, [])]}


STATIONS = [
    {"location_id": 1, "name": "A, Delhi - DPCC", "provider": "CPCB", "city": "Delhi", "sensors": {"pm25": [11]}},
    {"location_id": 2, "name": "B, Delhi - DPCC", "provider": "CPCB", "city": "Delhi", "sensors": {"pm25": [21]}},
    {"location_id": 3, "name": "C, Lucknow - CPCB", "provider": "CPCB", "city": "Lucknow", "sensors": {"pm25": [31]}},
    {"location_id": 4, "name": "D, Pune - MPCB", "provider": "CPCB", "city": "Pune", "sensors": {"pm25": [41]}},
]


def _assess(latest, hours, cfg=CFG, fail=(), stations=STATIONS):
    client = FakeOpenAQ(latest, hours, fail)
    return air.assess(stations, client, cfg, NOW), client


def test_assess_bands_cities_on_24h_means():
    latest = {11: (200, 2), 21: (180, 2), 31: (100, 3), 41: (20, 2)}  # Pune well below prefilter
    hours = {11: [300] * 24, 21: [280] * 20, 31: [150] * 18}
    figures, client = _assess(latest, hours)
    assert figures["counts"] == {"severe": 1, "very_poor": 1, "poor": 0}
    assert [(c["city"], c["band"], c["pm25_24h"], c["stations"]) for c in figures["cities"]] == [
        ("Delhi", "severe", 290.0, 2), ("Lucknow", "very_poor", 150.0, 1)]
    assert 41 not in client.history_calls
    assert figures["approximate"] is True and figures["data_as_of"] == (NOW - timedelta(hours=2)).isoformat()
    assert figures["stations_reporting"] == 4 and figures["cities_assessed"] == 2


def test_latest_hour_is_not_the_band():
    # Afternoon dip: latest 66 but the 24 h mean is Poor.
    figures, _ = _assess({11: (66, 1)}, {11: [119] * 24}, stations=STATIONS[:1])
    assert figures["cities"][0]["band"] == "poor"


def test_too_few_hours_gives_no_mean():
    figures, _ = _assess({11: (200, 1)}, {11: [300] * 15}, stations=STATIONS[:1])
    assert figures["cities"] == []


def test_stale_sensors_ignored():
    figures, client = _assess({11: (300, CFG["air"]["max_data_age_hours"] + 1)}, {11: [300] * 24},
                              stations=STATIONS[:1])
    assert figures["stations_reporting"] == 0 and client.history_calls == []


def test_newest_sensor_per_station_used():
    station = {"location_id": 1, "name": "A, Delhi - DPCC", "provider": "CPCB", "city": "Delhi",
               "sensors": {"pm25": [11, 12]}}
    _, client = _assess({11: (300, 50), 12: (200, 1)}, {12: [300] * 24}, stations=[station])
    assert client.history_calls == [12]


def test_request_cap_keeps_worst_cities():
    cfg = copy.deepcopy(CFG)
    cfg["air"]["max_history_requests"] = 1
    figures, client = _assess({11: (100, 1), 31: (300, 1)}, {11: [100] * 24, 31: [300] * 24},
                              cfg=cfg, stations=[STATIONS[0], STATIONS[2]])
    assert client.history_calls == [31] and figures["capped"] is True
    assert [c["city"] for c in figures["cities"]] == ["Lucknow"]


def test_big_city_sampled():
    cfg = copy.deepcopy(CFG)
    cfg["air"]["max_stations_per_city"] = 2
    stations = [{"location_id": i, "name": f"S{i}, Delhi - DPCC", "provider": "CPCB", "city": "Delhi",
                 "sensors": {"pm25": [100 + i]}} for i in range(6)]
    latest = {100 + i: (60 + 10 * i, 1) for i in range(6)}
    _, client = _assess(latest, {sid: [100] * 24 for sid in latest}, cfg=cfg, stations=stations)
    assert sorted(client.history_calls) == [100, 105]  # cleanest and dirtiest


def test_failed_history_requests_counted():
    figures, _ = _assess({11: (200, 1), 21: (200, 1)}, {21: [300] * 24}, fail={11}, stations=STATIONS[:2])
    assert figures["history_failed"] == 1 and figures["cities"][0]["stations"] == 1


# --- candidate text ------------------------------------------------------------------------

def _figures(cities, as_of=NOW):
    for c in cities:
        c.setdefault("data_to", as_of.isoformat())
    counts = {b: sum(1 for c in cities if c["band"] == b) for b in air.BANDS}
    return {"counts": counts, "cities": cities, "data_as_of": as_of.isoformat(), "approximate": True}


def test_candidate_level_4_reason_and_title():
    cities = [{"city": n, "band": "severe"} for n in ("Delhi", "Ghaziabad", "Noida", "Gurugram")]
    c = air.candidate(_figures(cities), CFG)
    assert (c.id, c.category, c.source, c.level) == ("air:IN", "air", "OPENAQ", 4)
    assert c.title == "Air quality: severe in 4 cities"
    assert c.reason == ("Severe in Delhi, Ghaziabad, Noida and 1 more "
                        "(approx. CPCB band; 24 h mean to 20 Oct, 20:30 IST)")
    assert c.figures["approximate"] is True


def test_candidate_single_city_and_none():
    c = air.candidate(_figures([{"city": "Delhi", "band": "very_poor"}, {"city": "Agra", "band": "poor"}]), CFG)
    assert c.level == 2 and c.title == "Air quality: very poor in Delhi"
    assert c.reason.startswith("Very poor in Delhi (approx. CPCB band")
    assert air.candidate(_figures([]), CFG) is None


# --- OpenAQ client pacing ------------------------------------------------------------------

def _resp(status=200, remaining="50", reset="7"):
    return SimpleNamespace(status_code=status, headers={"X-Ratelimit-Remaining": remaining, "X-Ratelimit-Reset": reset},
                           json=lambda: {"results": []}, raise_for_status=lambda: None)


def test_client_waits_on_429_then_succeeds():
    responses = iter([_resp(429), _resp(200)])
    slept = []
    client = air.OpenAQ(get=lambda *a, **k: next(responses), sleep=slept.append)
    assert client.get("/x", {}) == {"results": []}
    assert slept == [8] and client.requests == 2


def test_client_waits_when_quota_nearly_used():
    slept = []
    client = air.OpenAQ(get=lambda *a, **k: _resp(remaining="1", reset="30"), sleep=slept.append)
    client.get("/x", {})
    assert slept == [31]


# --- run_air lifecycle -------------------------------------------------------------------------

def _results(status="ok"):
    return {"OpenAQ": FetchResult("OpenAQ", [], True, status, None, 0.1, extras={"locations": []})}


def test_run_air_open_last_known_close(monkeypatch):
    db = FakeSupabase()
    stations = STATIONS[:1]
    monkeypatch.setattr(air, "reference_stations", lambda locations, cfg: stations)

    dirty = FakeOpenAQ({11: (300, 1)}, {11: [300] * 24})
    s1 = air.run_air(db, 1, _results(), NOW, cfg=CFG, client=dirty)
    assert (s1["level"], s1["change"]) == (3, "opened")
    (item,) = db.rows("desk_items")
    assert item["id"] == "air:IN" and item["severity_level"] == 3 and "approx. CPCB band" in item["severity_reason"]

    s2 = air.run_air(db, 2, _results("error"), NOW + timedelta(hours=6), cfg=CFG, client=dirty)
    assert s2["source_good"] is False and s2["change"] is None
    assert db.rows("desk_items")[0]["last_known"] is True

    clean = FakeOpenAQ({11: (20, 1)}, {})
    s3 = air.run_air(db, 3, _results(), NOW + timedelta(hours=12), cfg=CFG, client=clean)
    assert s3["change"] == "closed" and db.rows("desk_items")[0]["status"] == "closed"
    assert [s["change"] for s in db.rows("desk_item_snapshots")] == ["opened", None, "closed"]


def test_run_air_all_history_failed_is_last_known(monkeypatch):
    db = FakeSupabase()
    monkeypatch.setattr(air, "reference_stations", lambda locations, cfg: STATIONS[:1])
    air.run_air(db, 1, _results(), NOW, cfg=CFG, client=FakeOpenAQ({11: (300, 1)}, {11: [300] * 24}))
    s2 = air.run_air(db, 2, _results(), NOW, cfg=CFG, client=FakeOpenAQ({11: (300, 1)}, {}, fail={11}))
    assert s2["source_good"] is False and db.rows("desk_items")[0]["status"] == "open"
    assert db.rows("desk_items")[0]["last_known"] is True


def test_run_air_no_stations_is_last_known():
    s = air.run_air(FakeSupabase(), 1, _results(), NOW, cfg=CFG, client=FakeOpenAQ({}, {}))
    assert s["source_good"] is False and s["requests"] == 0


def test_reason_shows_range_when_named_cities_data_differ():
    cities = [{"city": "Delhi", "band": "severe", "data_to": NOW.isoformat()},
              {"city": "Agra", "band": "severe", "data_to": (NOW - timedelta(days=2)).isoformat()}]
    c = air.candidate(_figures(cities), CFG)
    assert c.reason == "Severe in Delhi, Agra (approx. CPCB band; 24 h means to 18–20 Oct)"


def test_assess_records_each_citys_data_time():
    figures, _ = _assess({11: (200, 30), 31: (200, 2)}, {11: [300] * 24, 31: [300] * 24},
                         stations=[STATIONS[0], STATIONS[2]])
    data_to = {c["city"]: c["data_to"] for c in figures["cities"]}
    assert data_to == {"Delhi": (NOW - timedelta(hours=30)).isoformat(),
                       "Lucknow": (NOW - timedelta(hours=2)).isoformat()}


# --- freshness cutoff and quorum ---------------------------------------------------------------

def test_repo_config_freshness_values():
    assert (REAL_CFG["air"]["fresh_within_hours"], REAL_CFG["air"]["min_fresh_cities"]) == (72, 10)


def test_stale_station_listed_but_not_counted():
    stale_age = CFG["air"]["fresh_within_hours"] + 6
    figures, _ = _assess({11: (300, 2), 31: (300, stale_age)}, {11: [300] * 24, 31: [300] * 24},
                         stations=[STATIONS[0], STATIONS[2]])
    assert figures["counts"] == {"severe": 1, "very_poor": 0, "poor": 0}
    assert [c["city"] for c in figures["cities"]] == ["Delhi"]
    assert [(r["city"], r["stale"]) for r in figures["station_means"]] == [("Delhi", False), ("Lucknow", True)]
    assert figures["fresh_cities"] == 1 and figures["data_as_of"] == (NOW - timedelta(hours=2)).isoformat()


def test_stale_station_in_fresh_city_is_flagged_and_excluded_from_mean():
    station_b = dict(STATIONS[1])
    figures, _ = _assess({11: (300, 2), 21: (100, 80)}, {11: [300] * 24, 21: [100] * 24},
                         stations=[STATIONS[0], station_b])
    (delhi,) = figures["cities"]
    assert delhi["pm25_24h"] == 300.0 and delhi["stations"] == 1 and delhi["stale_stations"] == 1


def test_fresh_requests_come_before_stale_under_the_cap():
    cfg = copy.deepcopy(CFG)
    cfg["air"]["max_history_requests"] = 1
    _, client = _assess({11: (100, 2), 31: (400, 80)}, {11: [100] * 24, 31: [400] * 24},
                        cfg=cfg, stations=[STATIONS[0], STATIONS[2]])
    assert client.history_calls == [11]


def test_quorum_not_met_fetches_no_history():
    cfg = copy.deepcopy(CFG)
    cfg["air"]["min_fresh_cities"] = 2
    figures, client = _assess({11: (300, 2), 31: (300, 80)}, {11: [300] * 24, 31: [300] * 24},
                              cfg=cfg, stations=[STATIONS[0], STATIONS[2]])
    assert figures["quorum_met"] is False and figures["fresh_cities"] == 1
    assert client.history_calls == [] and figures["counts"] == {"severe": 0, "very_poor": 0, "poor": 0}


def test_readings_older_than_the_current_level_do_not_count():
    level_from = NOW - timedelta(hours=10)
    client = FakeOpenAQ({11: (300, 2), 31: (300, 20), 41: (300, 10)},
                        {11: [300] * 24, 31: [300] * 24, 41: [300] * 24})
    figures = air.assess([STATIONS[0], STATIONS[2], STATIONS[3]], client, CFG, NOW, level_from)
    # Delhi is newer than the level's data and Pune as old: both count. Lucknow is older: listed, not counted.
    assert figures["fresh_cities"] == 2 and figures["cities_older_than_level"] == 1
    assert [c["city"] for c in figures["cities"]] == ["Delhi", "Pune"]
    assert [(r["city"], r["stale"]) for r in figures["station_means"]] == [
        ("Delhi", False), ("Pune", False), ("Lucknow", True)]
    assert figures["level_data_from"] == level_from.isoformat()
    assert figures["newest_reading"] == (NOW - timedelta(hours=2)).isoformat()


def test_only_readings_older_than_the_current_level_fetch_no_history():
    client = FakeOpenAQ({11: (300, 30)}, {11: [300] * 24})
    figures = air.assess(STATIONS[:1], client, CFG, NOW, NOW - timedelta(hours=6))
    assert figures["quorum_met"] is False and figures["fresh_cities"] == 0
    assert figures["cities_older_than_level"] == 1 and client.history_calls == []


def test_unchanged_openaq_data_still_counts_for_its_own_level(monkeypatch):
    """An OpenAQ level's data starts at its oldest 24 h window, so re-reading the same data still counts."""
    cfg = copy.deepcopy(CFG)
    cfg["air"]["min_fresh_cities"] = 2
    monkeypatch.setattr(air, "reference_stations", lambda locations, cfg: [STATIONS[0], STATIONS[2]])
    same = lambda: FakeOpenAQ({11: (300, 1), 31: (300, 3)}, {11: [300] * 24, 31: [300] * 24})
    db = FakeSupabase()
    air.run_air(db, 1, _results(), NOW, cfg=cfg, client=same())
    s2 = air.run_air(db, 2, _results(), NOW + timedelta(hours=6), cfg=cfg, client=same())
    assert s2["source_good"] is True and db.rows("desk_items")[0]["last_known"] is False


def test_run_air_quorum_failure_keeps_level_and_says_why(monkeypatch):
    db = FakeSupabase()
    monkeypatch.setattr(air, "reference_stations", lambda locations, cfg: STATIONS[:1])
    dirty = lambda: FakeOpenAQ({11: (300, 1)}, {11: [300] * 24})

    air.run_air(db, 1, _results(), NOW, cfg=CFG, client=dirty())
    opened = db.rows("desk_items")[0]
    assert opened["severity_level"] == 3

    strict = copy.deepcopy(CFG)
    strict["air"]["min_fresh_cities"] = 10
    for run_id in (2, 3):  # twice: the note must not pile up
        s = air.run_air(db, run_id, _results(), NOW + timedelta(hours=6 * run_id), cfg=strict, client=dirty())
        item = db.rows("desk_items")[0]
        assert s["source_good"] is False and s["change"] is None
        assert item["status"] == "open" and item["last_known"] is True and item["severity_level"] == 3
        assert item["severity_reason"] == (
            opened["severity_reason"] + " · last known: data.gov.in feed failed (no DATA_GOV_IN_API_KEY set); "
            "only 1 city has data from the last 72 h (need 10)")

    air.run_air(db, 4, _results(), NOW + timedelta(hours=30), cfg=CFG, client=dirty())
    item = db.rows("desk_items")[0]
    assert item["last_known"] is False and "last known" not in item["severity_reason"]
    snaps = db.rows("desk_item_snapshots")
    assert [s["last_known"] for s in snaps] == [False, True, True, False]
    assert "; only 1 city has data" in snaps[1]["severity_reason"]


def test_run_air_fetch_failure_note(monkeypatch):
    db = FakeSupabase()
    monkeypatch.setattr(air, "reference_stations", lambda locations, cfg: STATIONS[:1])
    air.run_air(db, 1, _results(), NOW, cfg=CFG, client=FakeOpenAQ({11: (300, 1)}, {11: [300] * 24}))
    s = air.run_air(db, 2, _results("error"), NOW, cfg=CFG, client=FakeOpenAQ({}, {}))
    # The note says why neither source gave a level (no key in tests, so the feed fails first).
    assert s["note"] == "data.gov.in feed failed (no DATA_GOV_IN_API_KEY set); OpenAQ fetch failed this run" and s["requests"] == 0
    assert db.rows("desk_items")[0]["severity_reason"].endswith(" · last known: data.gov.in feed failed (no DATA_GOV_IN_API_KEY set); OpenAQ fetch failed this run")


# --- watching (step 7) ------------------------------------------------------------------------

def test_assess_keeps_worst_cities_in_any_band():
    latest = {11: (60, 2), 21: (60, 2), 31: (100, 3), 41: (50, 2)}
    hours = {11: [80] * 24, 21: [70] * 24, 31: [150] * 18, 41: [50] * 24}
    figures, _ = _assess(latest, hours)
    assert [(c["city"], c["pm25_24h"]) for c in figures["worst_cities"]] == [
        ("Lucknow", 150.0), ("Delhi", 75.0), ("Pune", 50.0)]
    assert [c["city"] for c in figures["cities"]] == ["Lucknow"]   # only Poor or worse gets a band


def _worst(*cities):
    return {"worst_cities": [dict(c) for c in cities], "data_as_of": NOW.isoformat()}


def test_watch_subject_measures_the_city_the_next_level_hinges_on():
    cities = ({"city": "Delhi", "pm25_24h": 240.0, "pm10_24h": 300.0},
              {"city": "Noida", "pm25_24h": 200.0},
              {"city": "Patna", "pm10_24h": 420.0})            # PM10 420 is nearer Severe (430) than any PM2.5
    s = air.watch_subject(_worst(*cities), 2, True, REAL_CFG)  # Level 2 -> 3: Severe in 1 city
    assert (s.next_level, s.value, s.threshold, s.item_id) == (3, 420.0, 430, "air:IN")
    assert s.metric == "PM10 24 h mean (µg/m³) in Patna, the worst city; Severe starts above 430"
    s = air.watch_subject(_worst(*cities), 3, True, REAL_CFG)  # Level 3 -> 4: Severe in 3 cities
    assert (s.next_level, s.value, s.threshold) == (4, 200.0, 250)
    assert "Noida, the 3rd-worst city" in s.metric
    s = air.watch_subject(_worst(*cities[:2]), 3, True, REAL_CFG)
    assert s.next_level == 4 and s.value is None             # fewer than 3 cities measured
    s = air.watch_subject(_worst({"city": "Pune", "pm25_24h": 85.0}), None, False, REAL_CFG)
    assert (s.level, s.next_level, s.value, s.threshold, s.item_id) == (None, 1, 85.0, 90, None)
    assert air.watch_subject(_worst(*cities), 4, True, REAL_CFG).next_level is None


def test_run_air_hands_over_its_item_and_watch_subject(monkeypatch):
    db = FakeSupabase()
    monkeypatch.setattr(air, "reference_stations", lambda locations, cfg: STATIONS[:1])
    s = air.run_air(db, 1, _results(), NOW, cfg=CFG, client=FakeOpenAQ({11: (100, 1)}, {11: [100] * 24}))
    (subject,) = s["watch"]
    assert (subject.level, subject.next_level, subject.value, subject.threshold) == (1, 2, 100.0, 120)
    assert [i["id"] for i in s["items"]] == ["air:IN"]
    assert air.run_air(db, 2, _results("error"), NOW, cfg=CFG, client=FakeOpenAQ({}, {}))["watch"] == []
