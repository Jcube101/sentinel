from tools import backfill_severity_config as backfill

# The main checkout's reflog around editions 3, 9 and 10 (IST, as git prints it)
REFLOG = """\
cccc|HEAD@{2026-10-21T12:50:49+05:30}|merge feat/severity-pipeline: Fast-forward
dddd|HEAD@{2026-10-21T14:36:51+05:30}|merge feat/severity-pipeline: Fast-forward
eeee|HEAD@{2026-10-21T14:37:16+05:30}|merge feat/severity-pipeline: Fast-forward
ffff|HEAD@{2026-10-23T11:16:38+05:30}|merge feat/air-datagov: Fast-forward
eeee|HEAD@{2026-10-23T11:21:41+05:30}|reset: moving to eeee
gggg|HEAD@{2026-10-23T11:30:22+05:30}|merge feat/air-datagov: Fast-forward
"""
TOML = {
    "cccc": "[fire]\nlevel_2_min_ratio = 2.0\n",
    "dddd": "[fire]\nlevel_2_min_ratio = 2.0\n",
    "eeee": "[fire]\nlevel_2_min_ratio = 2.0\n",
    "ffff": "[fire]\nlevel_2_min_ratio = 2.0\n[air.datagov]\nmin_pollutants = 3\n",
    "gggg": "[fire]\nlevel_2_min_ratio = 2.0\n[air.datagov]\nmin_pollutants = 3\n",
}
MOVES = backfill.parse_reflog(REFLOG)


def _plan(started, finished):
    return backfill.plan({"started_at": started, "finished_at": finished}, MOVES, TOML.get)


def test_reflog_is_read_in_utc_oldest_first():
    assert [m.commit for m in MOVES] == ["cccc", "dddd", "eeee", "ffff", "eeee", "gggg"]
    assert MOVES[0].at.isoformat() == "2026-10-21T07:20:49+00:00"


def test_a_timer_run_takes_the_commit_checked_out_when_it_started():
    # edition 3: 09:00 UTC = 14:30 IST, before the 14:36 merges
    cfg = _plan("2026-10-21T09:00:07+00:00", "2026-10-21T09:05:36+00:00")
    assert cfg["fire"] == {"level_2_min_ratio": 2.0}
    assert cfg["_backfill"] == {"commit": "cccc", "certain": True, "note": None}


def test_a_move_during_the_run_to_the_same_file_stays_certain():
    cfg = _plan("2026-10-21T09:00:07+00:00", "2026-10-21T09:07:00+00:00")   # dddd, eeee: same file
    assert cfg["_backfill"]["certain"] is True


def test_a_move_during_the_run_to_a_different_file_is_not_certain():
    cfg = _plan("2026-10-23T05:44:00+00:00", "2026-10-23T05:48:00+00:00")   # starts on eeee, ffff at 05:46:38
    assert cfg["_backfill"]["commit"] == "eeee" and cfg["_backfill"]["certain"] is False
    assert "ffff at 05:46:38 UTC" in cfg["_backfill"]["note"]


def test_a_manual_run_is_marked_as_assumed():
    # edition 9: started 12 s after the air-datagov merge, outside the timer times
    cfg = _plan("2026-10-23T05:46:50+00:00", "2026-10-23T05:50:22+00:00")
    assert cfg["_backfill"]["commit"] == "ffff" and cfg["_backfill"]["certain"] is False
    assert cfg["_backfill"]["note"].startswith("manual run, assumed from the main checkout")
    assert "12 s before it started" in cfg["_backfill"]["note"]
    assert cfg["air"] == {"datagov": {"min_pollutants": 3}}


def test_no_commit_or_no_file_gives_nothing():
    assert _plan("2026-10-01T09:00:00+00:00", "2026-10-01T09:05:00+00:00") is None
    moves = backfill.parse_reflog("aaaa|HEAD@{2026-10-01T10:00:00+05:30}|commit: before severity.toml\n")
    assert backfill.plan({"started_at": "2026-10-01T09:00:00+00:00"}, moves, TOML.get) is None


def test_timer_times():
    from datetime import datetime
    assert backfill.is_timer_run(datetime.fromisoformat("2026-10-25T21:00:00+00:00"))
    assert backfill.is_timer_run(datetime.fromisoformat("2026-10-21T15:01:30+00:00"))
    assert not backfill.is_timer_run(datetime.fromisoformat("2026-10-20T17:50:11+00:00"))
