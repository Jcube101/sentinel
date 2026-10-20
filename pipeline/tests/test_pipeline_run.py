"""pipeline.run() end to end against a fake Supabase and fake fetchers.

The point: the run record and freshness stage must never stop the existing
events / aqi_readings writes, and its failures must still fail the run.
"""
from datetime import datetime, timezone
from types import SimpleNamespace

import pytest
import requests

import pipeline
from tests.fakes import FakeSupabase

NOW_ISO = datetime.now(timezone.utc).isoformat()
SOURCES = [{"id": sid, "name": sid, "newest_observation_at": None}
           for sid in ("FIRMS", "EONET", "GDACS", "USGS", "OPENAQ")]


def _fetcher(rows=None, exc=None):
    def fetch():
        if exc:
            raise exc
        return rows
    return SimpleNamespace(fetch=fetch)


def _default_fetchers():
    return {
        "FIRMS": _fetcher([{"id": "FIRMS-1", "started_at": NOW_ISO}]),
        "EONET": _fetcher([]),
        "GDACS": _fetcher([{"id": "GDACS-FL-1", "started_at": NOW_ISO, "raw": {}}]),
        "USGS": _fetcher([{"id": "USGS-1", "started_at": NOW_ISO}]),
        "OpenAQ": _fetcher([{"location_id": "1", "parameter": "pm25", "recorded_at": NOW_ISO}]),
    }


@pytest.fixture
def harness(monkeypatch):
    state = SimpleNamespace(db=FakeSupabase({"sources": SOURCES}), fetchers=_default_fetchers())

    monkeypatch.setattr(pipeline, "create_client", lambda *a: state.db)
    monkeypatch.setattr(pipeline.archive, "run", lambda: 0)
    monkeypatch.setattr(pipeline, "_cleanup", lambda supabase: None)
    monkeypatch.setattr(pipeline, "_check_staleness", lambda supabase, results: None)

    def run(dry_run=False):
        monkeypatch.setattr(pipeline, "FETCHERS", tuple(state.fetchers.items()))
        return pipeline.run(dry_run=dry_run)

    state.run = run
    return state


def _ops(db, table, op):
    return [payload for t, o, payload in db.calls if (t, o) == (table, op)]


def test_happy_path_writes_data_run_record_and_freshness(harness):
    assert harness.run() == 0
    db = harness.db
    (events,) = _ops(db, "events", "upsert")
    assert {e["id"] for e in events} == {"FIRMS-1", "GDACS-FL-1", "USGS-1"}
    assert len(_ops(db, "aqi_readings", "upsert")) == 1

    (run,) = db.rows("pipeline_runs")
    assert run["id"] == 1 and run["status"] == "ok"
    assert run["events_upserted"] == 3 and run["aqi_upserted"] == 1
    assert set(run["sources"]) == {"FIRMS", "EONET", "GDACS", "USGS", "OPENAQ"}
    assert run["sources"]["FIRMS"]["new_data"] is True

    by_id = {r["id"]: r for r in db.rows("sources")}
    assert all(r["last_run_id"] == 1 and r["last_status"] == "ok" for r in by_id.values())
    assert by_id["OPENAQ"]["last_success_at"] is not None


def test_second_run_with_same_data_is_not_new_data(harness):
    harness.run()
    harness.run()
    second = harness.db.rows("pipeline_runs")[1]
    assert second["id"] == 2
    assert not any(s["new_data"] for s in second["sources"].values())


def test_missing_tables_still_write_events_and_aqi_but_fail_the_run(harness):
    # Migration 001 not applied: pipeline_runs missing, sources lacks the columns.
    harness.db.missing = {"pipeline_runs", "sources"}
    assert harness.run() == 1
    assert len(_ops(harness.db, "events", "upsert")) == 1
    assert len(_ops(harness.db, "aqi_readings", "upsert")) == 1


def test_soft_gdacs_timeout_keeps_run_ok_but_not_last_success(harness):
    harness.fetchers["GDACS"] = _fetcher(exc=requests.exceptions.ReadTimeout("read timed out"))
    assert harness.run() == 0
    gdacs = next(r for r in harness.db.rows("sources") if r["id"] == "GDACS")
    assert gdacs["last_status"] == "timeout" and "last_success_at" not in gdacs
    assert harness.db.rows("pipeline_runs")[0]["status"] == "ok"


def test_fetcher_error_marks_run_failed_and_redacts(harness, monkeypatch):
    monkeypatch.setattr(pipeline.runs.config, "FIRMS_MAP_KEY", "firms-secret-key")
    harness.fetchers["FIRMS"] = _fetcher(exc=RuntimeError("400 for url: /csv/firms-secret-key/VIIRS"))
    assert harness.run() == 1
    run = harness.db.rows("pipeline_runs")[0]
    assert run["status"] == "failed"
    assert run["sources"]["FIRMS"]["status"] == "error"
    assert "firms-secret-key" not in run["sources"]["FIRMS"]["error"]
    firms = next(r for r in harness.db.rows("sources") if r["id"] == "FIRMS")
    assert "firms-secret-key" not in firms["last_error"]


def test_events_write_failure_is_recorded_per_source(harness):
    harness.db.missing = {"events"}
    assert harness.run() == 1
    by_id = {r["id"]: r for r in harness.db.rows("sources")}
    assert by_id["FIRMS"]["last_status"] == "error"
    assert by_id["OPENAQ"]["last_status"] == "ok"  # aqi_readings write still worked
    assert harness.db.rows("pipeline_runs")[0]["status"] == "failed"


def test_dry_run_writes_nothing(harness):
    assert harness.run(dry_run=True) == 0
    writes = [c for c in harness.db.calls if c[1] != "select"]
    assert writes == []
