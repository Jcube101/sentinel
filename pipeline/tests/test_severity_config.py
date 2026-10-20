"""severity.toml must load, match the spec's draft table, and reject bad edits."""
import copy
import re

import pytest

import severity_config
from severity_config import ConfigError, load, validate


@pytest.fixture
def cfg():
    return load()


def test_repo_config_loads(cfg):
    assert cfg["watching"]["margin"] == 0.05


def test_matches_spec_drafts(cfg):
    # The spec's draft table (docs/severity-pipeline.md), so an accidental
    # edit shows up in review. Update both together when retuning.
    assert [cfg["quake"][f"level_{n}_min_magnitude"] for n in (2, 3, 4)] == [5.0, 6.0, 7.0]
    assert [cfg["gdacs"][k] for k in ("green", "green_rising", "orange", "red")] == [1, 2, 3, 4]
    assert (cfg["fire"]["level_2_min_ratio"], cfg["fire"]["level_3_min_ratio"]) == (1.25, 2.0)
    assert cfg["fire"]["confidence"] == ["n", "h"]
    assert cfg["fire"]["lifecycle"] == {"open_min_level": 2, "close_after_hours": 48}
    assert (cfg["air"]["level_3_min_severe_cities"], cfg["air"]["level_4_min_severe_cities"]) == (1, 3)
    assert cfg["watching"]["rising_updates"] == 3


def test_cpcb_breakpoints(cfg):
    pm25, pm10 = cfg["air"]["pm25"], cfg["air"]["pm10"]
    assert (pm25["poor_above"], pm25["very_poor_above"], pm25["severe_above"]) == (90, 120, 250)
    assert (pm10["poor_above"], pm10["very_poor_above"], pm10["severe_above"]) == (250, 350, 430)


def _broken(cfg, dotted, value):
    bad = copy.deepcopy(cfg)
    *parents, leaf = dotted.split(".")
    node = bad
    for part in parents:
        node = node[part]
    if value is KeyError:
        del node[leaf]
    else:
        node[leaf] = value
    return bad


@pytest.mark.parametrize(
    "dotted, value, message",
    [
        ("quake.level_3_min_magnitude", 4.5, "quake.level_2_min_magnitude < quake.level_3"),
        ("fire.level_2_min_ratio", 2.5, "fire.level_2_min_ratio < fire.level_3_min_ratio"),
        ("air.pm25.very_poor_above", 300, "air.pm25.poor_above < air.pm25.very_poor_above"),
        ("air.level_4_min_severe_cities", 0, ">= 1"),
        ("gdacs.red", 5, "<= 4"),
        ("watching.margin", 1.5, "<= 1"),
        ("watching.rising_updates", 2.5, "must be an integer"),
        ("fire.min_fire_events", "ten", "must be an integer"),
        ("fire.confidence", ["x"], "fire.confidence"),
        ("fire.min_fire_events", KeyError, "missing fire.min_fire_events"),
        ("fire.lifecycle", KeyError, "missing fire.lifecycle.open_min_level"),
        ("quake.lifecycle", KeyError, "missing quake.lifecycle.open_min_level"),
        ("gdacs.lifecycle", KeyError, "missing gdacs.lifecycle.open_min_level"),
    ],
)
def test_rejects_bad_values(cfg, dotted, value, message):
    with pytest.raises(ConfigError, match=re.escape(message)):
        validate(_broken(cfg, dotted, value))


def test_bool_is_not_a_number(cfg):
    with pytest.raises(ConfigError, match="must be a number"):
        validate(_broken(cfg, "quake.india_buffer_km", True))


def test_load_reads_given_path(tmp_path):
    text = severity_config.CONFIG_PATH.read_text().replace("min_fire_events = 10", "min_fire_events = 25")
    path = tmp_path / "severity.toml"
    path.write_text(text)
    assert load(path)["fire"]["min_fire_events"] == 25
