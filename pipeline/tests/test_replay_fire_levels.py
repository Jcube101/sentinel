"""tools/replay_fire_levels.py: --set overrides and the per-day replay loop."""
from datetime import date

import pytest

from severity_config import ConfigError
from tests.test_fire_desk import CFG, NORMS, PLACES, _events
from tools import replay_fire_levels as replay


def test_set_overrides_existing_keys_only():
    cfg = {"fire": {"min_fire_events": 25, "lifecycle": {"close_after_hours": 48}}}
    replay.apply_override(cfg, "fire.min_fire_events=30")
    replay.apply_override(cfg, "fire.lifecycle.close_after_hours = 72")
    assert cfg == {"fire": {"min_fire_events": 30, "lifecycle": {"close_after_hours": 72}}}
    for bad in ("fire.nope=1", "nope.min_fire_events=1", "fire.min_fire_events", "fire.min_fire_events=[1"):
        with pytest.raises(ConfigError):
            replay.apply_override(cfg, bad)


def test_replay_counts_open_items_and_episodes():
    days = [(date(2026, 10, 20), _events(15, day=date(2026, 10, 20))),   # 1.5x the norm of 10: opens
            (date(2026, 10, 21), []),                                     # quiet day 1
            (date(2026, 10, 22), []),                                     # quiet day 2: closes
            (date(2026, 10, 23), _events(30, day=date(2026, 10, 23)))]   # 3x: reopens
    r = replay.replay(days, CFG, NORMS, PLACES)
    assert r["days"] == 4 and r["open_per_day"] == [1, 1, 0, 1]
    assert r["opened"]["Punjab"] == 2 and r["episodes"] == [2] and r["days_open"]["Punjab"] == 3
    assert r["firms_days"]["Punjab"] == {2: 1, 3: 1}
