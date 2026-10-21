"""datagov.py: the data.gov.in client (paging, retries, user agent, no key in errors) and parsing."""
from datetime import datetime, timezone

import pytest
import requests

import datagov

KEY = "579b464db66ec23bdd0000017a2b3c4d5e6f708192a3b4c5d6e7f8091a2b3c"


class Resp:
    def __init__(self, status=200, body=None, text=""):
        self.status_code, self._body, self.text = status, body, text or ""

    def json(self):
        if self._body is None:
            raise ValueError("no json")
        return self._body


def record(station="Alipur, Delhi - DPCC", city="Delhi", pollutant="PM2.5", avg="212", state="Delhi",
           updated="21-10-2026 19:00:00"):
    return {"country": "India", "state": state, "city": city, "station": station, "last_update": updated,
            "latitude": "28.8", "longitude": "77.1", "pollutant_id": pollutant,
            "min_value": "50", "max_value": "300", "avg_value": avg}


class FakeGet:
    """Answers pages from `rows`; `script` overrides the first responses (statuses or exceptions)."""

    def __init__(self, rows, script=()):
        self.rows, self.script, self.calls = rows, list(script), []

    def __call__(self, url, params=None, headers=None, timeout=None):
        self.calls.append({"url": url, "params": dict(params), "headers": dict(headers or {}), "timeout": timeout})
        if self.script:
            step = self.script.pop(0)
            if isinstance(step, Exception):
                raise step
            return step
        off, lim = params["offset"], params["limit"]
        return Resp(200, {"total": len(self.rows), "records": self.rows[off:off + lim]})


def test_fetch_pages_with_our_user_agent(monkeypatch):
    monkeypatch.setattr(datagov, "PAGE_SIZE", 2)
    rows = [record(pollutant=p) for p in ("PM2.5", "PM10", "NO2", "SO2", "CO")]
    get = FakeGet(rows)
    records, made = datagov.fetch(KEY, get=get, sleep=lambda s: None)
    assert records == rows and made == 3
    assert [c["params"]["offset"] for c in get.calls] == [0, 2, 4]
    first = get.calls[0]
    assert first["headers"]["User-Agent"] == datagov.USER_AGENT and "python-requests" not in datagov.USER_AGENT
    assert first["params"]["api-key"] == KEY and first["params"]["format"] == "json"
    assert first["url"] == datagov.API_URL


def test_fetch_retries_5xx_then_succeeds():
    get = FakeGet([record()], script=[Resp(502), Resp(503, text="busy")])
    slept = []
    records, made = datagov.fetch(KEY, get=get, sleep=slept.append)
    assert len(records) == 1 and made == 3 and slept == [5, 10]


@pytest.mark.parametrize("failure, status", [
    (requests.Timeout("read timed out"), "timeout"),
    (requests.ConnectionError(f"Max retries exceeded with url: /resource/x?api-key={KEY}&format=json"), "error"),
    (Resp(502), "error"),
])
def test_fetch_gives_up_after_retries_without_leaking_the_key(failure, status):
    get = FakeGet([record()], script=[failure] * datagov.RETRIES)
    with pytest.raises(datagov.FeedError) as err:
        datagov.fetch(KEY, get=get, sleep=lambda s: None)
    assert err.value.status == status and KEY not in str(err.value) and len(get.calls) == datagov.RETRIES


def test_fetch_does_not_retry_a_rejected_key(monkeypatch):
    import config
    monkeypatch.setattr(config, "DATA_GOV_IN_API_KEY", KEY)
    get = FakeGet([], script=[Resp(403, text=f'{{"error": "Key not authorised: {KEY}"}}')])
    with pytest.raises(datagov.FeedError) as err:
        datagov.fetch(KEY, get=get, sleep=lambda s: None)
    assert len(get.calls) == 1 and "HTTP 403" in str(err.value) and KEY not in str(err.value)


def test_fetch_without_a_key_or_records():
    with pytest.raises(datagov.FeedError, match="no DATA_GOV_IN_API_KEY"):
        datagov.fetch(None, get=FakeGet([]))
    with pytest.raises(datagov.FeedError) as err:
        datagov.fetch(KEY, get=FakeGet([]), sleep=lambda s: None)
    assert err.value.status == "empty"


def test_non_json_200_is_retried():
    get = FakeGet([record()], script=[Resp(200, None, text="<html>maintenance</html>")])
    records, made = datagov.fetch(KEY, get=get, sleep=lambda s: None)
    assert len(records) == 1 and made == 2


def test_tests_never_reach_the_real_api():
    with pytest.raises(AssertionError, match="must not call data.gov.in"):
        datagov.fetch(KEY, sleep=lambda s: None)


# --- parsing -----------------------------------------------------------------------------

def test_parse_time_is_ist():
    t = datagov.parse_time("21-10-2026 19:00:00")
    assert t.astimezone(timezone.utc) == datetime(2026, 10, 21, 13, 30, tzinfo=timezone.utc)
    assert datagov.parse_time("NA") is None and datagov.parse_time(None) is None


def test_stations_group_sub_indices_and_skip_na():
    rows = [record(pollutant="PM2.5", avg="212"), record(pollutant="PM10", avg="NA"),
            record(pollutant="NO2", avg="41"), record(pollutant="CO", avg="-1"),
            record(station="Pusa, Delhi - IMD", pollutant="OZONE", avg="30", updated="21-10-2026 18:00:00")]
    st = datagov.stations(rows)
    alipur = st["Alipur, Delhi - DPCC"]
    assert alipur["sub_indices"] == {"PM2.5": 212.0, "NO2": 41.0}
    assert (alipur["city"], alipur["state"], alipur["latitude"]) == ("Delhi", "Delhi", 28.8)
    assert alipur["updated"] == datagov.parse_time("21-10-2026 19:00:00")
    assert st["Pusa, Delhi - IMD"]["sub_indices"] == {"OZONE": 30.0}


@pytest.mark.parametrize("subs, expected", [
    ({"PM2.5": 212, "PM10": 150, "NO2": 41}, (212, ["PM2.5"])),
    ({"PM10": 180, "OZONE": 180, "CO": 20}, (180, ["OZONE", "PM10"])),     # tie: both prominent
    ({"PM2.5": 212, "NO2": 41}, (None, [])),                               # only 2 pollutants
    ({"NO2": 41, "SO2": 12, "OZONE": 250}, (None, [])),                     # no PM2.5 or PM10
    ({"PM2.5": 300.6, "PM10": 1, "CO": 1}, (301, ["PM2.5"])),
])
def test_station_aqi_follows_cpcb(subs, expected):
    assert datagov.station_aqi(subs, 3) == expected


def test_city_prominent_pollutant():
    assert datagov.prominent([["PM2.5"], ["PM2.5", "PM10"], ["PM10"], ["PM2.5"]]) == ["PM2.5"]
    assert datagov.prominent([["PM10"], ["OZONE"]]) == ["OZONE", "PM10"]
    assert datagov.prominent([]) == []
