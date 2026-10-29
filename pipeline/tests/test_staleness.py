"""_check_staleness: FIRMS isn't stored in events (since 29 Oct 2026), so its age is
that of its newest observation on its sources row; the others still read events."""
from datetime import datetime, timedelta, timezone

import pipeline
from tests.fakes import FakeSupabase

NOW = datetime.now(timezone.utc)
FETCHED = {"FIRMS": True, "EONET": True, "GDACS": True, "USGS": True, "OpenAQ": True}


def _ago(**kw):
    return (NOW - timedelta(**kw)).isoformat()


def _db(firms_newest, usgs_started=None):
    events = [{"id": "EONET-1", "source": "EONET", "started_at": _ago(days=40)},
              {"id": "GDACS-1", "source": "GDACS", "started_at": _ago(days=3)},
              {"id": "USGS-1", "source": "USGS", "started_at": usgs_started or _ago(days=1)}]
    return FakeSupabase({"sources": [{"id": "FIRMS", "newest_observation_at": firms_newest}],
                         "events": events, "aqi_readings": [{"id": 1, "recorded_at": _ago(hours=2)}]})


def _alerts(monkeypatch):
    sent = []
    monkeypatch.setattr(pipeline.notify, "send_alert", lambda subject, body: sent.append(subject))
    return sent


def test_fresh_firms_from_its_sources_row_with_no_firms_rows_in_events(monkeypatch):
    sent = _alerts(monkeypatch)
    pipeline._check_staleness(_db(_ago(hours=6)), FETCHED)
    assert sent == []


def test_stale_firms_alerts(monkeypatch):
    sent = _alerts(monkeypatch)
    pipeline._check_staleness(_db(_ago(days=3)), FETCHED)
    assert sent == ["Sentinel: FIRMS data is stale"]


def test_firms_without_an_observation_alerts(monkeypatch):
    sent = _alerts(monkeypatch)
    pipeline._check_staleness(_db(None), FETCHED)
    assert sent == ["Sentinel: FIRMS has never ingested any rows"]


def test_usgs_still_reads_events(monkeypatch):
    sent = _alerts(monkeypatch)
    pipeline._check_staleness(_db(_ago(hours=6), usgs_started=_ago(days=8)), FETCHED)
    assert sent == ["Sentinel: USGS data is stale"]
