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
CFG = load()
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
    """latest: sensor -> (value, hours_ago); hours: sensor -> list of hourly values."""

    def __init__(self, latest, hours, fail=()):
        super().__init__(get=None, sleep=lambda s: None)
        self.latest, self.hours, self.fail = latest, hours, set(fail)
        self.history_calls = []

    def get(self, path, params):
        self.requests += 1
        if path.startswith("/parameters/"):
            rows = [{"sensorsId": sid, "value": v,
                     "datetime": {"utc": (NOW - timedelta(hours=age)).isoformat()}}
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
