"""runs.py: fetch classification, newest observation, freshness updates, redaction."""
from datetime import datetime, timedelta, timezone

import pytest

import config
import runs
from runs import FetchResult

NOW = datetime(2026, 10, 20, 15, 0, tzinfo=timezone.utc)


def _result(name, rows=(), status="ok", error=None):
    return FetchResult(name=name, rows=list(rows), ok=status != "error", status=status,
                       error=error, duration_s=1.23)


def _firms_row(hours_ago):
    return {"id": f"FIRMS-{hours_ago}", "started_at": (NOW - timedelta(hours=hours_ago)).isoformat()}


# --- classify ---------------------------------------------------------------

@pytest.mark.parametrize("name, rows, error, timed_out, soft, expected", [
    ("FIRMS", [1], None, False, False, (True, "ok")),
    ("FIRMS", [], None, False, False, (True, "empty")),     # dense source, nothing back
    ("OpenAQ", [], None, False, False, (True, "empty")),
    ("GDACS", [], None, False, True, (True, "ok")),         # event-driven: quiet is fine
    ("EONET", [], None, False, False, (True, "ok")),
    ("GDACS", [], TimeoutError(), True, True, (True, "timeout")),    # soft timeout
    ("USGS", [], TimeoutError(), True, False, (False, "timeout")),
    ("USGS", [], ValueError("bad json"), False, False, (False, "error")),
])
def test_classify(name, rows, error, timed_out, soft, expected):
    assert runs.classify(name, rows, error, timed_out, soft) == expected


# --- newest_observation -----------------------------------------------------

def test_newest_observation_uses_started_at():
    rows = [_firms_row(5), _firms_row(1), _firms_row(30)]
    assert runs.newest_observation("FIRMS", rows) == NOW - timedelta(hours=1)


def test_newest_observation_uses_recorded_at_for_aqi():
    rows = [{"recorded_at": "2026-10-20T08:30:00+00:00"}, {"recorded_at": "2026-10-19T08:30:00+00:00"}]
    assert runs.newest_observation("OpenAQ", rows) == datetime(2026, 10, 20, 8, 30, tzinfo=timezone.utc)


def test_newest_observation_prefers_gdacs_datemodified():
    rows = [{"started_at": "2026-09-12T01:00:00+00:00", "raw": {"datemodified": "2026-10-20T14:21:13"}}]
    # naive GDACS timestamps are UTC
    assert runs.newest_observation("GDACS", rows) == datetime(2026, 10, 20, 14, 21, 13, tzinfo=timezone.utc)


def test_newest_observation_ignores_bad_and_missing_dates():
    rows = [{"started_at": None}, {"started_at": "garbage"}, {}]
    assert runs.newest_observation("FIRMS", rows) is None


# --- source_updates ----------------------------------------------------------

def _updates(results, previous=None, written=None):
    written = written or {r.name: True for r in results}
    return runs.source_updates({r.name: r for r in results}, written, previous or {}, 7, NOW)


def test_good_fetch_records_success_and_new_data():
    updates, summary = _updates([_result("FIRMS", [_firms_row(2)])])
    u = updates["FIRMS"]
    assert u["last_success_at"] == u["last_attempt_at"] == NOW.isoformat()
    assert u["last_status"] == "ok" and u["last_error"] is None and u["last_row_count"] == 1
    assert u["last_run_id"] == 7
    assert u["newest_observation_at"] == (NOW - timedelta(hours=2)).isoformat()
    assert u["last_new_data_at"] == NOW.isoformat()
    assert summary["FIRMS"] == {
        "status": "ok", "rows": 1, "duration_s": 1.2, "error": None,
        "newest_observation_at": (NOW - timedelta(hours=2)).isoformat(), "new_data": True,
    }


def test_same_data_again_is_not_new_data():
    # The 02:30 IST run repeating the 20:30 IST FIRMS data.
    previous = {"FIRMS": {"newest_observation_at": (NOW - timedelta(hours=2)).isoformat()}}
    updates, summary = _updates([_result("FIRMS", [_firms_row(2), _firms_row(9)])], previous)
    assert "newest_observation_at" not in updates["FIRMS"]
    assert "last_new_data_at" not in updates["FIRMS"]
    assert updates["FIRMS"]["last_success_at"] == NOW.isoformat()  # still a good fetch
    assert summary["FIRMS"]["new_data"] is False


def test_older_data_never_moves_newest_backwards():
    previous = {"FIRMS": {"newest_observation_at": NOW.isoformat()}}
    updates, _ = _updates([_result("FIRMS", [_firms_row(3)])], previous)
    assert "newest_observation_at" not in updates["FIRMS"]


@pytest.mark.parametrize("status, error", [
    ("error", "500 Server Error"),
    ("timeout", "read timed out"),
    ("empty", None),
])
def test_bad_fetch_keeps_last_success(status, error):
    updates, summary = _updates([_result("OpenAQ", status=status, error=error)])
    u = updates["OPENAQ"]
    assert "last_success_at" not in u and "newest_observation_at" not in u
    assert (u["last_status"], u["last_error"]) == (status, error)
    assert summary["OPENAQ"]["new_data"] is False


def test_failed_write_is_not_a_good_fetch():
    updates, summary = _updates([_result("USGS", [_firms_row(1)])], written={"USGS": False})
    u = updates["USGS"]
    assert u["last_status"] == "error" and "write failed" in u["last_error"]
    assert "last_success_at" not in u and summary["USGS"]["new_data"] is False


def test_quiet_sparse_source_is_good_without_observation():
    updates, summary = _updates([_result("GDACS", [])])
    assert updates["GDACS"]["last_success_at"] == NOW.isoformat()
    assert "newest_observation_at" not in updates["GDACS"]
    assert summary["GDACS"]["newest_observation_at"] is None


def test_gdacs_query_parts_reach_the_run_summary_redacted(monkeypatch):
    monkeypatch.setattr(config, "FIRMS_MAP_KEY", "a" * 32)
    parts = {"floods_cyclones": {"status": "ok", "features": 11, "duration_s": 2.5},
             "wildfires": {"status": "error", "features": 0, "duration_s": 3.1,
                           "error": "400 for url: /SEARCH?key=" + "a" * 32}}
    result = FetchResult("GDACS", [], True, "ok", None, 5.6, {"alerts": [], "parts": parts})
    _, summary = _updates([result, _result("USGS", [])])
    assert summary["GDACS"]["parts"]["floods_cyclones"] == parts["floods_cyclones"]
    assert summary["GDACS"]["parts"]["wildfires"]["error"] == "400 for url: /SEARCH?key=***"
    assert "parts" not in summary["USGS"]


def test_openaq_maps_to_sources_id():
    updates, summary = _updates([_result("OpenAQ", [{"recorded_at": NOW.isoformat()}])])
    assert set(updates) == set(summary) == {"OPENAQ"}


# --- redact -------------------------------------------------------------------

def test_redact_strips_configured_keys(monkeypatch):
    monkeypatch.setattr(config, "FIRMS_MAP_KEY", "abc123secretkey")
    monkeypatch.setattr(config, "OPENAQ_API_KEY", "openaq-secret-value")
    text = "400 for url: https://x/api/area/csv/abc123secretkey/VIIRS key=openaq-secret-value"
    out = runs.redact(text)
    assert "abc123secretkey" not in out and "openaq-secret-value" not in out
    assert out.count("***") == 2


def test_redact_strips_any_32_hex_key(monkeypatch):
    monkeypatch.setattr(config, "FIRMS_MAP_KEY", None)
    key = "0123456789abcdef0123456789ABCDEF"
    assert runs.redact(f"https://firms/api/area/csv/{key}/VIIRS") == "https://firms/api/area/csv/***/VIIRS"


def test_redact_truncates_and_passes_none():
    assert runs.redact(None) is None
    assert len(runs.redact("x" * 5000)) == runs.ERROR_TEXT_LIMIT


def test_redact_strips_the_data_gov_in_key_and_any_api_key_param(monkeypatch):
    key = "579b464db66ec23bdd0000017a2b3c4d5e6f708192a3b4c5d6e7f8091a2b3c"
    monkeypatch.setattr(runs.config, "DATA_GOV_IN_API_KEY", key)
    assert key not in runs.redact(f"502 for url: https://api.data.gov.in/resource/x?api-key={key}&format=json")
    other = runs.redact("https://api.data.gov.in/resource/x?format=json&api-key=someone-elses-key-123&limit=10")
    assert other == "https://api.data.gov.in/resource/x?format=json&api-key=***&limit=10"
    assert runs.redact("https://example.org/?MAP_KEY=abc123def456") == "https://example.org/?MAP_KEY=***"


def test_freshness_update_marks_new_data_only_when_newer():
    t1 = datetime(2026, 10, 21, 13, 30, tzinfo=timezone.utc)
    now = datetime(2026, 10, 21, 14, 0, tzinfo=timezone.utc)
    update, new = runs.freshness_update("ok", None, 3710, t1, {"newest_observation_at": None}, 7, now)
    assert new and update["newest_observation_at"] == t1.isoformat() and update["last_success_at"] == now.isoformat()
    update, new = runs.freshness_update("ok", None, 3710, t1, {"newest_observation_at": t1.isoformat()}, 8, now)
    assert not new and "newest_observation_at" not in update
    update, new = runs.freshness_update("timeout", "timed out", 0, None, None, 9, now)
    assert not new and "last_success_at" not in update and update["last_status"] == "timeout"
