"""OpenAQ fetcher: aqi_readings rows unchanged by fetch_detailed(); extras carry every station."""
from datetime import datetime, timedelta, timezone
from types import SimpleNamespace

from fetchers import openaq

NOW = datetime.now(timezone.utc)


def _loc(lid, hours_ago):
    return {"id": lid, "name": f"Site {lid}, Delhi - DPCC", "locality": None,
            "provider": {"name": "CPCB"}, "coordinates": {"latitude": 28.6, "longitude": 77.2},
            "datetimeLast": {"utc": (NOW - timedelta(hours=hours_ago)).isoformat()},
            "sensors": [{"id": lid * 10, "parameter": {"name": "pm25"}}]}


def _patch(monkeypatch, locations):
    monkeypatch.setattr(openaq, "MAX_LOCATIONS", 2)
    monkeypatch.setattr(openaq.time, "sleep", lambda s: None)
    page = SimpleNamespace(json=lambda: {"results": locations}, raise_for_status=lambda: None)
    monkeypatch.setattr(openaq, "get_with_retry", lambda *a, **k: page)

    def sensors(url, **kwargs):
        lid = int(url.split("/")[-2])
        return SimpleNamespace(raise_for_status=lambda: None, json=lambda: {"results": [{
            "parameter": {"name": "pm25", "units": "µg/m³"},
            "latest": {"value": 100.0 + lid, "datetime": {"utc": (NOW - timedelta(hours=1)).isoformat()}},
        }]})
    monkeypatch.setattr(openaq.requests, "get", sensors)


def test_readings_poll_freshest_max_locations_and_extras_carry_all(monkeypatch):
    locations = [_loc(1, 50), _loc(2, 1), _loc(3, 2), _loc(4, 200)]  # 4 is older than CUTOFF_HOURS
    _patch(monkeypatch, locations)
    rows, extras = openaq.fetch_detailed()
    assert [r["location_id"] for r in rows] == ["2", "3"]           # freshest 2 polled
    assert set(rows[0]) == {"location_id", "location_name", "city", "latitude", "longitude",
                            "parameter", "value", "unit", "recorded_at"}
    assert [loc["id"] for loc in extras["locations"]] == [2, 3, 1]   # every recent station


def test_fetch_returns_the_same_rows(monkeypatch):
    _patch(monkeypatch, [_loc(2, 1), _loc(3, 2)])
    assert openaq.fetch() == openaq.fetch_detailed()[0]
