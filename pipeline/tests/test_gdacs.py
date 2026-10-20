"""GDACS fetcher: paging, de-duplication and category filtering.

The HTTP layer is replaced with a fake, so these tests make no network calls.
"""
import pytest

from fetchers import gdacs

IN_INDIA = [78.0, 22.0]       # lon, lat
IN_INDONESIA = [110.0, -7.0]


def _feature(eventid, eventtype="FL", coords=IN_INDIA, alertlevel="Green"):
    return {
        "geometry": {"type": "Point", "coordinates": coords},
        "properties": {
            "eventtype": eventtype,
            "eventid": eventid,
            "alertlevel": alertlevel,
            "eventname": f"{eventtype} {eventid}",
            "fromdate": "2026-10-01T00:00:00",
            "todate": "2026-10-02T00:00:00",
            "isfinal": False,
            "country": "India",
            "url": {"report": "https://www.gdacs.org/report"},
        },
    }


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


@pytest.fixture
def fake_api(monkeypatch):
    """Serve `pages` (a list of FakeResponse) by pageNumber; record requests."""
    state = {"pages": [], "requested": []}

    def fake_get(source, url, params=None, **kwargs):
        page = params["pageNumber"]
        state["requested"].append(page)
        assert params["pageSize"] == gdacs.PAGE_SIZE
        if page > len(state["pages"]):
            return FakeResponse(204)
        return state["pages"][page - 1]

    monkeypatch.setattr(gdacs, "get_with_retry", fake_get)
    return state


def _full_page(start_id, coords=IN_INDONESIA):
    return FakeResponse(200, [_feature(i, coords=coords) for i in range(start_id, start_id + gdacs.PAGE_SIZE)])


def test_follows_pages_until_short_page(fake_api):
    # Two full pages of Indonesian events, then the India events on page 3.
    fake_api["pages"] = [
        _full_page(1),
        _full_page(101),
        FakeResponse(200, [_feature(900, "FL"), _feature(901, "TC")]),
    ]
    events = gdacs.fetch()
    assert fake_api["requested"] == [1, 2, 3]
    assert sorted(e["id"] for e in events) == ["GDACS-FL-900", "GDACS-TC-901"]


def test_stops_on_204_after_exactly_full_pages(fake_api):
    fake_api["pages"] = [_full_page(1, coords=IN_INDIA)]
    events = gdacs.fetch()
    assert fake_api["requested"] == [1, 2]
    assert len(events) == gdacs.PAGE_SIZE


def test_no_events_at_all_returns_empty(fake_api):
    fake_api["pages"] = []  # first page is a 204
    assert gdacs.fetch() == []


def test_wildfire_and_drought_kept_out_of_events(fake_api):
    fake_api["pages"] = [FakeResponse(200, [
        _feature(1, "WF"), _feature(2, "DR"), _feature(3, "EQ"),
    ])]
    assert [e["id"] for e in gdacs.fetch()] == ["GDACS-EQ-3"]


def test_duplicate_event_across_pages_returned_once(fake_api):
    # Results shifted between page requests: the last row of page 1 reappears
    # on page 2. The later copy wins.
    page1 = _full_page(1, coords=IN_INDIA)
    page2 = FakeResponse(200, [_feature(gdacs.PAGE_SIZE, alertlevel="Orange")])
    fake_api["pages"] = [page1, page2]
    events = gdacs.fetch()
    ids = [e["id"] for e in events]
    assert len(ids) == len(set(ids)) == gdacs.PAGE_SIZE
    dup = next(e for e in events if e["id"] == f"GDACS-FL-{gdacs.PAGE_SIZE}")
    assert dup["severity"] == "high"


def test_http_error_on_later_page_fails_the_fetch(fake_api):
    fake_api["pages"] = [_full_page(1), FakeResponse(500)]
    with pytest.raises(RuntimeError):
        gdacs.fetch()


def test_page_guard_stops_runaway_paging(fake_api, monkeypatch):
    monkeypatch.setattr(gdacs, "MAX_PAGES", 3)
    fake_api["pages"] = [_full_page(i * 100 + 1) for i in range(10)]
    gdacs.fetch()
    assert fake_api["requested"] == [1, 2, 3]
