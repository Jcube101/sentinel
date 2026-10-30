"""GDACS fetcher: the three queries, paging, de-duplication and category filtering.

The HTTP layer is replaced with a fake, so these tests make no network calls.
"""
from datetime import datetime, timedelta, timezone

import pytest
import requests

import config
from fetchers import gdacs

IN_INDIA = [78.0, 22.0]       # lon, lat
IN_INDONESIA = [110.0, -7.0]


def _gdacs_time(days_ago):
    # GDACS sends naive UTC timestamps
    return (datetime.now(timezone.utc) - timedelta(days=days_ago)).strftime("%Y-%m-%dT%H:%M:%S")


def _feature(eventid, eventtype="FL", coords=IN_INDIA, alertlevel="Green",
             started_days_ago=5, iscurrent="true"):
    props = {
        "eventtype": eventtype,
        "eventid": eventid,
        "alertlevel": alertlevel,
        "eventname": f"{eventtype} {eventid}",
        "fromdate": _gdacs_time(started_days_ago),
        "todate": _gdacs_time(started_days_ago - 1),
        "country": "India",
        "url": {"report": "https://www.gdacs.org/report"},
    }
    if iscurrent is not None:
        props["iscurrent"] = iscurrent
    return {"geometry": {"type": "Point", "coordinates": coords}, "properties": props}


class FakeResponse:
    def __init__(self, status_code=200, features=None):
        self.status_code = status_code
        self._features = features

    def raise_for_status(self):
        if self.status_code >= 400:
            raise RuntimeError(f"HTTP {self.status_code}")

    def json(self):
        if self.status_code == 204:
            raise ValueError("204 has no body")
        return {"features": self._features}


class JsonResponse:
    def __init__(self, body, status_code=200):
        self.status_code, self._body = status_code, body

    def raise_for_status(self):
        if self.status_code >= 400:
            raise RuntimeError(f"HTTP {self.status_code}")

    def json(self):
        return self._body


FC, WF, EQ = "TC;FL", "WF", "EQ"   # the three queries' eventlist values
TIMELINE_URL = "https://www.gdacs.org/gdacsapi/api/export/gettimeline?id=816527"


@pytest.fixture
def fake_api(monkeypatch):
    """Serve pages by query and pageNumber; record (eventlist, page) requests.

    pages: a list served to every query (each query keeps only its own
    types, as with an API that ignores the filter), or {eventlist: [pages]}.
    A page past the end is a 204; an exception in the list is raised.
    """
    state = {"pages": [], "requested": [], "calls": [], "storms": [], "event_data": None, "timeline": None}

    def fake_get(source, url, params=None, **kwargs):
        if url != gdacs.ENDPOINT:   # a cyclone's record, then its timeline
            state["storms"].append((url, params))
            body = state["event_data"] if url == gdacs.EVENT_DATA_URL else state["timeline"]
            if isinstance(body, Exception):
                raise body
            return JsonResponse(body if body is not None else {})
        page, query = params["pageNumber"], params["eventlist"]
        state["requested"].append((query, page))
        state["calls"].append({"params": params, **kwargs})
        assert params["pageSize"] == gdacs.PAGE_SIZE
        pages = state["pages"].get(query, []) if isinstance(state["pages"], dict) else state["pages"]
        if page > len(pages):
            return FakeResponse(204)
        if isinstance(pages[page - 1], Exception):
            raise pages[page - 1]
        return pages[page - 1]

    monkeypatch.setattr(gdacs, "get_with_retry", fake_get)
    return state


def _full_page(start_id, coords=IN_INDONESIA, eventtype="FL"):
    return FakeResponse(200, [_feature(i, eventtype, coords=coords) for i in range(start_id, start_id + gdacs.PAGE_SIZE)])


def _pages(fake_api, query):
    return [p for q, p in fake_api["requested"] if q == query]


def test_follows_pages_until_short_page(fake_api):
    # Two full pages of Indonesian floods, then the India events on page 3.
    fake_api["pages"] = {FC: [
        _full_page(1),
        _full_page(101),
        FakeResponse(200, [_feature(900, "FL"), _feature(901, "TC")]),
    ]}
    events = gdacs.fetch()
    assert _pages(fake_api, FC) == [1, 2, 3]
    assert sorted(e["id"] for e in events) == ["GDACS-FL-900", "GDACS-TC-901"]


def test_stops_on_204_after_exactly_full_pages(fake_api):
    fake_api["pages"] = {FC: [_full_page(1, coords=IN_INDIA)]}
    events = gdacs.fetch()
    assert _pages(fake_api, FC) == [1, 2]
    assert len(events) == gdacs.PAGE_SIZE


def test_no_events_at_all_returns_empty(fake_api):
    fake_api["pages"] = []  # every first page is a 204
    rows, extras = gdacs.fetch_detailed()
    assert rows == [] and extras["alerts"] == [] and extras["wildfires_ok"] is True


def test_three_queries_in_order_with_eventlist(fake_api):
    gdacs.fetch()
    assert [q for q, _ in fake_api["requested"]] == [FC, WF, EQ]
    params = fake_api["calls"][0]["params"]
    assert "eventtypes" not in params                       # the API ignores it
    assert (params["country"], params["alertlevel"]) == ("IND", "Green;Orange;Red")


def test_every_page_uses_the_longer_gdacs_read_timeout(fake_api):
    fake_api["pages"] = {FC: [_full_page(1)]}
    gdacs.fetch()
    assert config.GDACS_READ_TIMEOUT_S == 90
    assert [c["timeout"] for c in fake_api["calls"]] == [(30, 90)] * 4    # FC pages 1-2, WF, EQ


def test_each_page_time_is_logged(fake_api, caplog):
    page = _full_page(1)
    page.elapsed = timedelta(seconds=7.25)
    fake_api["pages"] = {FC: [page]}
    with caplog.at_level("INFO", logger="fetchers.gdacs"):
        gdacs.fetch()
    lines = [r.getMessage() for r in caplog.records if " page " in r.getMessage()]
    assert lines[0].startswith("GDACS: floods/cyclones page 1: 100 features, ")
    assert lines[0].endswith(", last request 7.2 s")
    assert lines[1].startswith("GDACS: floods/cyclones page 2: no content, ")
    assert lines[2].startswith("GDACS: wildfires page 1: no content, ")


def test_wildfire_and_drought_kept_out_of_events(fake_api):
    fake_api["pages"] = [FakeResponse(200, [
        _feature(1, "WF"), _feature(2, "DR"), _feature(3, "EQ"),
    ])]
    assert [e["id"] for e in gdacs.fetch()] == ["GDACS-EQ-3"]


def test_each_query_keeps_only_its_own_types(fake_api):
    # The API ignored the old `eventtypes` filter; if it ignores eventlist too,
    # quakes must not reach the alerts and wildfires must not reach events.
    fake_api["pages"] = [FakeResponse(200, [_india(1, "TC"), _india(2, "WF"), _india(3, "EQ"), _india(4, "DR")])]
    rows, extras = gdacs.fetch_detailed()
    assert sorted(a["id"] for a in extras["alerts"]) == ["GDACS-TC-1", "GDACS-WF-2"]
    assert sorted(r["id"] for r in rows) == ["GDACS-EQ-3", "GDACS-TC-1"]
    assert {n: p["features"] for n, p in extras["parts"].items() if n != "tracks"} == {
        "floods_cyclones": 1, "wildfires": 1, "earthquakes": 1}


def test_duplicate_event_across_pages_returned_once(fake_api):
    # Results shifted between page requests: the last row of page 1 reappears
    # on page 2. The later copy wins.
    page1 = _full_page(1, coords=IN_INDIA)
    page2 = FakeResponse(200, [_feature(gdacs.PAGE_SIZE, alertlevel="Orange")])
    fake_api["pages"] = {FC: [page1, page2]}
    events = gdacs.fetch()
    ids = [e["id"] for e in events]
    assert len(ids) == len(set(ids)) == gdacs.PAGE_SIZE
    dup = next(e for e in events if e["id"] == f"GDACS-FL-{gdacs.PAGE_SIZE}")
    assert dup["severity"] == "high"


def test_floods_cyclones_failure_fails_the_fetch_and_skips_the_rest(fake_api):
    fake_api["pages"] = {FC: [_full_page(1), FakeResponse(500)]}
    with pytest.raises(RuntimeError):
        gdacs.fetch()
    assert [q for q, _ in fake_api["requested"]] == [FC, FC]


def test_floods_cyclones_timeout_stays_a_timeout(fake_api):
    # pipeline._run_fetcher treats a GDACS timeout as soft (not a run failure).
    fake_api["pages"] = {FC: [requests.exceptions.ReadTimeout("read timed out")]}
    with pytest.raises(requests.exceptions.Timeout):
        gdacs.fetch_detailed()


def _india(i, kind):
    f = _feature(i, kind)
    f["properties"]["affectedcountries"] = [{"iso3": "IND", "countryname": "India"}]
    return f


def test_wildfire_failure_keeps_flood_and_cyclone_alerts(fake_api):
    # Page 6 of the old single query answered 400 (No. 10, the 28 Oct dry run).
    fake_api["pages"] = {FC: [FakeResponse(200, [_india(1, "TC")])],
                         WF: [_full_page(1, eventtype="WF"), FakeResponse(400)],
                         EQ: [FakeResponse(200, [_feature(3, "EQ")])]}
    rows, extras = gdacs.fetch_detailed()
    assert [a["id"] for a in extras["alerts"]] == ["GDACS-TC-1"] and extras["wildfires_ok"] is False
    assert sorted(r["id"] for r in rows) == ["GDACS-EQ-3", "GDACS-TC-1"]
    wf = extras["parts"]["wildfires"]
    assert (wf["status"], wf["error"]) == ("error", "HTTP 400")


def test_earthquake_failure_is_best_effort(fake_api):
    fake_api["pages"] = {FC: [FakeResponse(200, [_india(1, "FL")])],
                         EQ: [_full_page(1, coords=IN_INDIA, eventtype="EQ"),
                              requests.exceptions.ReadTimeout("read timed out")]}
    rows, extras = gdacs.fetch_detailed()
    assert len(rows) == 1 + gdacs.PAGE_SIZE                        # the flood + the page it got
    assert [a["id"] for a in extras["alerts"]] == ["GDACS-FL-1"] and extras["wildfires_ok"] is True
    eq = extras["parts"]["earthquakes"]
    assert (eq["status"], eq["features"]) == ("timeout", gdacs.PAGE_SIZE)


def test_page_guard_stops_runaway_paging(fake_api, monkeypatch):
    monkeypatch.setattr(gdacs, "MAX_PAGES", 3)
    fake_api["pages"] = {FC: [_full_page(i * 100 + 1) for i in range(10)]}
    gdacs.fetch()
    assert _pages(fake_api, FC) == [1, 2, 3]


def _only_event(fake_api, **feature_kwargs):
    fake_api["pages"] = [FakeResponse(200, [_feature(1, **feature_kwargs)])]
    (event,) = gdacs.fetch()
    return event


def test_iscurrent_false_closes_event(fake_api):
    event = _only_event(fake_api, iscurrent="false")
    assert event["status"] == "closed"
    assert event["closed_at"] == gdacs._parse_dt(event["raw"]["todate"])


def test_iscurrent_true_keeps_event_open(fake_api):
    event = _only_event(fake_api, iscurrent="true")
    assert (event["status"], event["closed_at"]) == ("open", None)


def test_iscurrent_accepts_json_booleans(fake_api):
    assert _only_event(fake_api, iscurrent=False)["status"] == "closed"


def test_without_iscurrent_falls_back_to_isfinal_and_todate(fake_api):
    feature = _feature(1, iscurrent=None)
    feature["properties"]["isfinal"] = True  # todate is in the past
    fake_api["pages"] = [FakeResponse(200, [feature])]
    assert gdacs.fetch()[0]["status"] == "closed"

    fake_api["pages"] = [FakeResponse(200, [_feature(1, iscurrent=None)])]
    assert gdacs.fetch()[0]["status"] == "open"


def test_skips_events_that_started_before_retention_window(fake_api):
    fake_api["pages"] = [FakeResponse(200, [
        _feature(1, started_days_ago=gdacs.SHORT_RETENTION_DAYS + 1),
        _feature(2, started_days_ago=gdacs.SHORT_RETENTION_DAYS - 1),
    ])]
    assert [e["id"] for e in gdacs.fetch()] == ["GDACS-FL-2"]


def test_unparseable_start_date_is_not_skipped(fake_api):
    feature = _feature(1)
    feature["properties"]["fromdate"] = "not a date"
    fake_api["pages"] = [FakeResponse(200, [feature])]
    assert [e["id"] for e in gdacs.fetch()] == ["GDACS-FL-1"]


# --- a cyclone's track (the event record's timeline) ---------------------------------

def _timeline_item(advisory, when, lat, lon, wind_ms, status, actual=True):
    return {"advisory_number": str(advisory), "advisory_datetime": when, "actual": str(actual),
            "latitude": str(lat), "longitude": str(lon), "wind_speed": str(wind_ms),
            "storm_status": [status, status]}


def _serve_track(fake_api):
    fake_api["event_data"] = {"properties": {"impacts": [{"source": "JTWC", "resource": {
        "timeline": TIMELINE_URL, "buffer39": "https://www.gdacs.org/gdacsapi/api/export/getimpact?id=1"}}]}}
    fake_api["timeline"] = {"channel": {"item": [   # ARNAB-26's last advisories, out of order
        _timeline_item(10, "28 Oct 2026 06:00", 16.4, 81.8, 28.292, "Tropical Storm"),
        _timeline_item(7, "27 Oct 2026 12:00", 16.3, 82.7, 61.728, "Hurricane/Typhoon > 74 mph"),
        _timeline_item(10, "28 Oct 2026 18:00", 17.8, 81.9, 23.148, "Tropical Storm", actual=False),
    ]}}


def test_current_cyclone_gets_its_observed_track_from_the_timeline(fake_api):
    _serve_track(fake_api)
    fake_api["pages"] = {FC: [FakeResponse(200, [_india(1, "TC")])]}
    _, extras = gdacs.fetch_detailed()
    (alert,) = extras["alerts"]
    assert alert["track"] == [   # oldest first, forecast points left out, m/s -> km/h
        {"at": "2026-10-27T12:00:00+00:00", "latitude": 16.3, "longitude": 82.7, "wind_kmh": 222,
         "storm_status": "Hurricane/Typhoon > 74 mph"},
        {"at": "2026-10-28T06:00:00+00:00", "latitude": 16.4, "longitude": 81.8, "wind_kmh": 102,
         "storm_status": "Tropical Storm"},
    ]
    assert fake_api["storms"] == [(gdacs.EVENT_DATA_URL, {"eventtype": "TC", "eventid": 1}), (TIMELINE_URL, None)]
    assert {k: extras["parts"]["tracks"][k] for k in ("status", "features")} == {"status": "ok", "features": 1}


def test_track_failure_keeps_the_alert_and_never_fails_the_fetch(fake_api):
    fake_api["event_data"] = requests.exceptions.Timeout("slow")
    fake_api["pages"] = {FC: [FakeResponse(200, [_india(1, "TC")])]}
    rows, extras = gdacs.fetch_detailed()
    (alert,) = extras["alerts"]
    assert "track" not in alert and [r["id"] for r in rows] == ["GDACS-TC-1"]
    assert extras["parts"]["tracks"]["status"] == "error" and "slow" in extras["parts"]["tracks"]["error"]
    fake_api["event_data"] = {"properties": {"impacts": []}}   # a record without a timeline
    assert gdacs.fetch_detailed()[1]["parts"]["tracks"]["status"] == "error"


def test_no_track_request_for_floods_or_finished_cyclones(fake_api):
    _serve_track(fake_api)
    finished = _india(2, "TC")
    finished["properties"]["iscurrent"] = "false"
    fake_api["pages"] = {FC: [FakeResponse(200, [_india(1, "FL"), finished])]}
    _, extras = gdacs.fetch_detailed()
    assert fake_api["storms"] == [] and "tracks" not in extras["parts"]
