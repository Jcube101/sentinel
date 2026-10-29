"""pipeline.run() end to end against a fake Supabase and fake fetchers.

The point: the run record and freshness stage must never stop the existing
events / aqi_readings writes, and its failures must still fail the run.
"""
import sys
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
    assert set(run["sources"]) == {"FIRMS", "EONET", "GDACS", "USGS", "OPENAQ", "DATAGOV"}  # DATAGOV: the air feed
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


def test_each_edition_stores_the_thresholds_its_stages_ran_with(harness, monkeypatch):
    import watch

    seen, real = [], watch.run_quiet

    def spy(*args, cfg=None, **kwargs):
        seen.append(cfg)
        return real(*args, cfg=cfg, **kwargs)

    monkeypatch.setattr(watch, "run_quiet", spy)
    assert harness.run() == 0
    (run,) = harness.db.rows("pipeline_runs")
    assert run["severity_config"] == pipeline.severity_config.load()
    assert seen == [run["severity_config"]]          # the very dict the stages used


def test_unloadable_thresholds_still_open_the_run_record_and_fail_the_run(harness, monkeypatch):
    def broken(*a, **k):
        raise pipeline.severity_config.ConfigError("severity.toml: missing fire.level_2_min_ratio")

    monkeypatch.setattr(pipeline.severity_config, "load", broken)
    assert harness.run() == 1
    (run,) = harness.db.rows("pipeline_runs")
    assert run["status"] == "failed" and "severity_config" not in run
    assert len(_ops(harness.db, "events", "upsert")) == 1      # the raw writes still happen


def test_dry_run_stores_no_thresholds(harness):
    harness.run(dry_run=True)
    assert harness.db.rows("pipeline_runs") == []


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


def _firms_timeout():
    return _fetcher(exc=requests.exceptions.ReadTimeout("read timed out"))


def test_one_firms_timeout_does_not_fail_the_run(harness):
    harness.fetchers["FIRMS"] = _firms_timeout()
    assert harness.run() == 0
    run = harness.db.rows("pipeline_runs")[0]
    assert run["status"] == "ok" and run["sources"]["FIRMS"]["status"] == "timeout"
    firms = next(r for r in harness.db.rows("sources") if r["id"] == "FIRMS")
    assert firms["last_status"] == "timeout" and "last_success_at" not in firms


def test_second_firms_timeout_in_a_row_fails_the_run(harness):
    harness.fetchers["FIRMS"] = _firms_timeout()
    assert [harness.run(), harness.run()] == [0, 1]
    assert [r["status"] for r in harness.db.rows("pipeline_runs")] == ["ok", "failed"]


def test_a_good_firms_fetch_in_between_starts_the_count_again(harness):
    good, codes = harness.fetchers["FIRMS"], []
    for fetcher in (_firms_timeout(), good, _firms_timeout()):
        harness.fetchers["FIRMS"] = fetcher
        codes.append(harness.run())
    assert codes == [0, 0, 0]


def test_firms_errors_other_than_timeouts_still_fail_at_once(harness):
    harness.fetchers["FIRMS"] = _fetcher(exc=RuntimeError("500 Server Error"))
    assert harness.run() == 1


def test_firms_timeout_fails_the_run_when_the_previous_status_cannot_be_read():
    class Unreachable:
        def table(self, name):
            raise RuntimeError("supabase unreachable")

    result = pipeline.runs.FetchResult("FIRMS", [], False, "timeout", "read timed out", 113.4)
    pipeline._tolerate_first_timeouts(Unreachable(), {"FIRMS": result})
    assert result.ok is False


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


def _quake_row(qid="us1", mag=5.1):
    return {"id": f"USGS-{qid}", "started_at": NOW_ISO, "latitude": 28.6, "longitude": 77.2,
            "severity_value": mag, "place_name": "Delhi, India",
            "geometry": {"coordinates": [77.2, 28.6, 10]}, "raw": {"mag": mag, "place": "Delhi, India"}}


def test_desk_items_written_with_run_id(harness):
    harness.fetchers["USGS"] = _fetcher([_quake_row()])
    assert harness.run() == 0
    (item,) = harness.db.rows("desk_items")
    assert item["id"] == "earthquake:USGS-us1" and item["severity_level"] == 2 and item["first_run_id"] == 1
    (snap,) = harness.db.rows("desk_item_snapshots")
    assert (snap["run_id"], snap["change"]) == (1, "opened")


def test_desk_failure_fails_run_but_keeps_data_writes(harness):
    harness.fetchers["USGS"] = _fetcher([_quake_row()])
    harness.db.missing = {"desk_items"}
    assert harness.run() == 1
    assert len(_ops(harness.db, "events", "upsert")) == 1
    assert len(_ops(harness.db, "aqi_readings", "upsert")) == 1
    assert harness.db.rows("pipeline_runs")[0]["status"] == "failed"


def test_dry_run_before_migration_002_is_ok(harness):
    harness.fetchers["USGS"] = _fetcher([_quake_row()])
    harness.db.missing = {"desk_items", "desk_item_snapshots"}
    assert harness.run(dry_run=True) == 0


def test_gdacs_extras_reach_the_desk(harness):
    alert = {"id": "GDACS-TC-9", "eventtype": "TC", "eventid": 9, "name": "Tropical Cyclone NINE",
             "alertlevel": "Red", "alertscore": 3.0, "episodeid": 4, "episodealertlevel": "Red",
             "episodealertscore": 3.0, "severity": 180.0, "severity_text": "Very severe", "severity_unit": "km/h",
             "iscurrent": True, "fromdate": NOW_ISO, "todate": NOW_ISO, "datemodified": NOW_ISO,
             "latitude": 18.0, "longitude": 88.0, "countries": ["IND"], "country_names": ["India"], "url": "u"}
    harness.fetchers["GDACS"] = SimpleNamespace(fetch_detailed=lambda: ([], {"alerts": [alert]}))
    assert harness.run() == 0
    (item,) = harness.db.rows("desk_items")
    assert (item["id"], item["severity_level"], item["severity_reason"]) == (
        "cyclone:GDACS-TC-9", 4, "GDACS Red alert")


def test_desk_import_failure_only_fails_that_stage(harness, monkeypatch):
    # e.g. shapely missing from the live venv
    monkeypatch.setitem(sys.modules, "desk", None)
    assert harness.run() == 1
    assert len(_ops(harness.db, "events", "upsert")) == 1
    assert len(_ops(harness.db, "aqi_readings", "upsert")) == 1
    assert harness.db.rows("pipeline_runs")[0]["status"] == "failed"


def test_air_failure_only_fails_that_stage(harness, monkeypatch):
    import air
    monkeypatch.setattr(air, "run_air", lambda *a, **k: (_ for _ in ()).throw(RuntimeError("boom")))
    harness.fetchers["USGS"] = _fetcher([_quake_row()])
    assert harness.run() == 1
    assert len(_ops(harness.db, "events", "upsert")) == 1
    assert len(harness.db.rows("desk_items")) == 1  # the quake desk stage still ran
    assert harness.db.rows("pipeline_runs")[0]["status"] == "failed"


def test_openaq_extras_reach_the_air_stage(harness, monkeypatch):
    import air
    seen = {}

    def fake_run_air(supabase, run_id, results, now, write=True, cfg=None):
        seen["locations"] = results["OpenAQ"].extras["locations"]
        return {"items": [], "watch": [], "level": None, "reason": None, "source_good": True, "note": None,
                "source": "OpenAQ", "source_id": "OPENAQ", "source_status": "ok", "fallback_reason": None,
                "datagov": None, "change": None, "requests": 0, "counts": None, "stations": 0,
                "fresh_cities": 0, "severe_unconfirmed": []}

    monkeypatch.setattr(air, "run_air", fake_run_air)
    harness.fetchers["OpenAQ"] = SimpleNamespace(fetch_detailed=lambda: ([], {"locations": [{"id": 7}]}))
    assert harness.run() == 0
    assert seen["locations"] == [{"id": 7}]


def test_fire_failure_only_fails_that_stage(harness, monkeypatch):
    import fire
    monkeypatch.setattr(fire, "run_fire", lambda *a, **k: (_ for _ in ()).throw(RuntimeError("boom")))
    harness.fetchers["USGS"] = _fetcher([_quake_row()])
    assert harness.run() == 1
    assert len(_ops(harness.db, "events", "upsert")) == 1
    assert len(_ops(harness.db, "aqi_readings", "upsert")) == 1
    assert len(harness.db.rows("desk_items")) == 1  # later stages still ran
    assert harness.db.rows("pipeline_runs")[0]["status"] == "failed"


def test_fire_desk_failure_only_fails_that_stage(harness, monkeypatch):
    import fire_desk
    monkeypatch.setattr(fire_desk, "run_fire_desk", lambda *a, **k: (_ for _ in ()).throw(RuntimeError("boom")))
    harness.fetchers["USGS"] = _fetcher([_quake_row()])
    assert harness.run() == 1
    assert len(_ops(harness.db, "events", "upsert")) == 1
    assert len(harness.db.rows("desk_items")) == 1  # the quake desk stage still ran
    assert harness.db.rows("pipeline_runs")[0]["status"] == "failed"


def test_fire_stage_rows_reach_the_fire_desk(harness, monkeypatch):
    import fire
    import fire_desk
    seen = {}
    monkeypatch.setattr(fire, "run_fire", lambda *a, **k: {
        "rows": ["fire event"], "dates": [], "hotspots": 0, "masked": 0, "mask_cells": 0, "fire_events": 0,
        "districts": 0, "states": 0, "superseded": 0, "top_districts": []})

    def fake_run_fire_desk(supabase, run_id, results, now, rows=None, write=True, cfg=None):
        seen["rows"], seen["run_id"] = rows, run_id
        return {"day": "2026-10-20", "source_good": True, "note": None, "assessed": 0, "open": [],
                "max_level": None, "changes": {}, "top_ratios": [], "unmatched_alerts": 0}

    monkeypatch.setattr(fire_desk, "run_fire_desk", fake_run_fire_desk)
    assert harness.run() == 0
    assert seen == {"rows": ["fire event"], "run_id": 1}


def test_quiet_stage_writes_status_and_watch_rows(harness):
    harness.fetchers["USGS"] = _fetcher([_quake_row()])
    assert harness.run() == 0
    statuses = {r["category"]: r for r in harness.db.rows("category_status")}
    assert sorted(statuses) == ["air", "cyclone", "earthquake", "fire", "flood"]
    assert statuses["earthquake"]["level"] == 2 and statuses["earthquake"]["run_id"] == 1
    assert [r["id"] for r in harness.db.rows("desk_watch")] == ["earthquake:USGS-us1"]


def test_quiet_stage_failure_only_fails_that_stage(harness):
    harness.fetchers["USGS"] = _fetcher([_quake_row()])
    harness.db.missing = {"desk_watch"}          # migration 005 not applied
    assert harness.run() == 1
    assert len(harness.db.rows("desk_items")) == 1
    assert harness.db.rows("pipeline_runs")[0]["status"] == "failed"


def test_dry_run_before_migration_005_is_ok(harness):
    harness.fetchers["USGS"] = _fetcher([_quake_row()])
    harness.db.missing = {"desk_watch", "category_status"}
    assert harness.run(dry_run=True) == 0


def test_data_gov_in_attempt_lands_in_the_run_record(harness):
    # conftest drops the key, so the feed attempt fails fast and is recorded as an error
    harness.db.tables["sources"].append({"id": "DATAGOV", "name": "DATAGOV", "newest_observation_at": None})
    assert harness.run() == 0
    run = harness.db.rows("pipeline_runs")[0]
    assert run["sources"]["DATAGOV"]["status"] == "error"
    assert "no DATA_GOV_IN_API_KEY" in run["sources"]["DATAGOV"]["error"]
    row = next(r for r in harness.db.rows("sources") if r["id"] == "DATAGOV")
    assert row["last_status"] == "error" and row["last_run_id"] == 1
