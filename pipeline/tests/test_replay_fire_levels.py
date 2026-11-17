"""tools/replay_fire_levels.py: --set overrides and the per-day replay loop."""
from datetime import date

import pytest

from severity_config import ConfigError
from tests.test_fire_desk import CFG as _CFG, NORMS, PLACES, _events
from tools import replay_fire_levels as replay

# The replay mechanics are tested on the old 48 h rule (two quiet days), whatever severity.toml says now.
CFG = {**_CFG, "fire": {**_CFG["fire"], "lifecycle": {**_CFG["fire"]["lifecycle"], "close_after_hours": 48}}}


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
    # 15 Nov 2026: uncapped level-3 state-days, and the days between a close and the reopening
    assert (r["l3_days"], r["l4_days"], r["reopen_gaps"]) == (1, 0, [1])
    s = replay.summary(r, "t")
    assert (s["l3_per_day"], s["reopens"], s["reopen_within_3d"], s["open_per_day"]) == (0.25, 1, 1, 0.75)


def _series(ratios):
    """Per-day (level, ratio, counted) for one state: Level 2 from 2x, as the desk levels it."""
    return [(date(2026, 11, 1 + i), {"Punjab": (2 if r >= 2 else 1, r, True)}) for i, r in enumerate(ratios)]


def test_simulate_today_matches_the_desk_replay():
    days = [(date(2026, 10, 20), _events(15, day=date(2026, 10, 20))), (date(2026, 10, 21), []),
            (date(2026, 10, 22), []), (date(2026, 10, 23), _events(30, day=date(2026, 10, 23)))]
    r = replay.replay(days, CFG, NORMS, PLACES)
    sim = replay.simulate(r["series"], CFG, None)
    assert (sim["opens"], sim["episodes"], sim["reopens"], sim["open_days"]) == (2, r["episodes"], 1, sum(r["open_per_day"]))


def test_close_line_holds_an_item_between_the_lines():
    ratios = [2.4, 1.8, 1.7, 1.4, 1.3, 2.2]
    today = replay.simulate(_series(ratios), CFG, None)
    held = replay.simulate(_series(ratios), CFG, 1.5)
    # today: day 2 starts the clock, day 3 closes, day 6 reopens 3 days later
    assert (today["closes"], today["reopens"], today["reopen_within_3d"], today["held_days"]) == (1, 1, 1, 0)
    # close line 1.5: days 2-3 held, day 4 starts the clock, day 5 closes, day 6 reopens a day later
    assert (held["closes"], held["reopens"], held["reopen_within_3d"], held["held_days"]) == (1, 1, 1, 2)
    assert held["episodes"] == [4] and today["episodes"] == [2]


def test_close_line_keeps_a_steady_decline_from_reopening():
    ratios = [2.4, 1.8, 2.1, 1.7, 2.2, 1.6, 1.2, 1.1, 1.0]   # hovering round the open line, then really gone
    today = replay.simulate(_series(ratios), CFG, None)
    held = replay.simulate(_series(ratios), CFG, 1.5)
    assert held["opens"] == 1 and held["closes"] == 1 and held["episodes"] == [7]
    assert today["opens"] == 1 and today["closes"] == 1   # the dips are one day each: the clock never reaches 48 h


def test_uncounted_days_never_hold_an_item():
    series = [(date(2026, 11, 1), {"Punjab": (2, 2.4, True)}), (date(2026, 11, 2), {"Punjab": (1, 1.8, False)}),
              (date(2026, 11, 3), {"Punjab": (1, 1.8, False)})]
    assert replay.simulate(series, CFG, 1.5)["closes"] == 1


def test_flicker_counts_a_level_2_story_that_drops_and_returns_within_3_days():
    ratios = [2.4, 1.8, 2.2, 1.2, 1.1, 1.0, 1.0, 2.5]    # one dip a day (1.8), then a real fall, then a late return
    today = replay.simulate(_series(ratios), CFG, None)
    held = replay.simulate(_series(ratios), CFG, 1.5)
    assert (today["drops"], today["flickers"]) == (2, 1)   # the 1.8 dip returns next day; the fall to 1.2 doesn't return in 3 d
    assert (held["drops"], held["flickers"]) == (1, 0)     # 1.8 is held at Level 2: the reader sees no dip
