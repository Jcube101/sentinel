"""Load and check severity.toml, the one home for severity thresholds.

    from severity_config import load
    cfg = load()
    cfg["quake"]["level_3_min_magnitude"]  # 6.0

load() raises ConfigError naming the bad key, so a mistyped or
out-of-order threshold fails loudly instead of mis-levelling items.
"""
import tomllib
from pathlib import Path

CONFIG_PATH = Path(__file__).with_name("severity.toml")
CONFIDENCE_CODES = {"l", "n", "h"}


class ConfigError(ValueError):
    pass


def load(path: Path | str = CONFIG_PATH) -> dict:
    with open(path, "rb") as f:
        cfg = tomllib.load(f)
    validate(cfg)
    return cfg


def _get(cfg: dict, dotted: str):
    node = cfg
    for part in dotted.split("."):
        if not isinstance(node, dict) or part not in node:
            raise ConfigError(f"severity.toml: missing {dotted}")
        node = node[part]
    return node


def _number(cfg, dotted, *, minimum=None, maximum=None, integer=False):
    value = _get(cfg, dotted)
    kinds = (int,) if integer else (int, float)
    if isinstance(value, bool) or not isinstance(value, kinds):
        kind = "an integer" if integer else "a number"
        raise ConfigError(f"severity.toml: {dotted} must be {kind}, got {value!r}")
    if minimum is not None and value < minimum:
        raise ConfigError(f"severity.toml: {dotted} must be >= {minimum}, got {value}")
    if maximum is not None and value > maximum:
        raise ConfigError(f"severity.toml: {dotted} must be <= {maximum}, got {value}")
    return value


def _ascending(cfg, *dotted, strict=True):
    values = [_get(cfg, d) for d in dotted]
    pairs = zip(values, values[1:])
    if not all(a < b if strict else a <= b for a, b in pairs):
        order = " < " if strict else " <= "
        raise ConfigError(f"severity.toml: expected {order.join(dotted)}, got {values}")


def validate(cfg: dict) -> None:
    _number(cfg, "watching.margin", minimum=0, maximum=1)
    _number(cfg, "watching.rising_updates", minimum=1, integer=True)
    _number(cfg, "watching.rising_min_progress", minimum=0, maximum=1)
    _number(cfg, "watching.keep_days", minimum=1, integer=True)

    quake_levels = [f"quake.level_{n}_min_magnitude" for n in (2, 3, 4)]
    for key in quake_levels:
        _number(cfg, key, minimum=0)
    _ascending(cfg, *quake_levels)
    _number(cfg, "quake.india_buffer_km", minimum=0)
    _number(cfg, "quake.anywhere_min_magnitude", minimum=0)
    _number(cfg, "quake.lifecycle.open_min_level", minimum=1, maximum=4, integer=True)
    _number(cfg, "quake.lifecycle.close_after_hours", minimum=1)

    gdacs_levels = [f"gdacs.{k}" for k in ("green", "green_rising", "orange", "red")]
    for key in gdacs_levels:
        _number(cfg, key, minimum=1, maximum=4, integer=True)
    _ascending(cfg, *gdacs_levels, strict=False)
    _number(cfg, "gdacs.lifecycle.open_min_level", minimum=1, maximum=4, integer=True)

    for pollutant in ("pm25", "pm10"):
        bands = [f"air.{pollutant}.{b}_above" for b in ("poor", "very_poor", "severe")]
        for key in bands:
            _number(cfg, key, minimum=0)
        _ascending(cfg, *bands)
    _number(cfg, "air.level_3_min_severe_cities", minimum=1, integer=True)
    _number(cfg, "air.level_4_min_severe_cities", minimum=1, integer=True)
    _ascending(cfg, "air.level_3_min_severe_cities", "air.level_4_min_severe_cities", strict=False)
    providers = _get(cfg, "air.providers")
    if not isinstance(providers, list) or not providers or not all(isinstance(p, str) for p in providers):
        raise ConfigError(f"severity.toml: air.providers must be a non-empty list of names, got {providers!r}")
    _number(cfg, "air.max_data_age_hours", minimum=1)
    _number(cfg, "air.fresh_within_hours", minimum=1)
    _ascending(cfg, "air.fresh_within_hours", "air.max_data_age_hours", strict=False)
    _number(cfg, "air.min_fresh_cities", minimum=1, integer=True)
    _number(cfg, "air.min_hours_for_mean", minimum=1, maximum=24, integer=True)
    _number(cfg, "air.prefilter_fraction", minimum=0, maximum=1)
    _number(cfg, "air.max_history_requests", minimum=0, integer=True)
    _number(cfg, "air.max_stations_per_city", minimum=1, integer=True)
    aliases = cfg["air"].get("city_aliases", {})
    if not isinstance(aliases, dict) or not all(isinstance(v, str) for v in aliases.values()):
        raise ConfigError(f"severity.toml: air.city_aliases must map names to names, got {aliases!r}")
    _number(cfg, "air.lifecycle.open_min_level", minimum=1, maximum=4, integer=True)
    _number(cfg, "air.severe_confirm_runs", minimum=1, integer=True)
    _number(cfg, "air.datagov.max_snapshot_age_hours", minimum=1)
    _number(cfg, "air.datagov.min_pollutants", minimum=1, maximum=7, integer=True)
    aqi_bands = [f"air.aqi.{b}_above" for b in ("poor", "very_poor", "severe")]
    for key in aqi_bands:
        _number(cfg, key, minimum=0, maximum=500)
    _ascending(cfg, *aqi_bands)

    confidence = _get(cfg, "fire.confidence")
    if not isinstance(confidence, list) or not confidence or not set(confidence) <= CONFIDENCE_CODES:
        raise ConfigError(
            f"severity.toml: fire.confidence must be a non-empty list of {sorted(CONFIDENCE_CODES)}, "
            f"got {confidence!r}"
        )
    _number(cfg, "fire.cluster_km", minimum=0.1)
    _number(cfg, "fire.events_retention_days", minimum=2, integer=True)
    excluded = _get(cfg, "fire.excluded_district_ids")
    if not isinstance(excluded, list) or not all(isinstance(d, str) for d in excluded):
        raise ConfigError(f"severity.toml: fire.excluded_district_ids must be a list of ids, got {excluded!r}")
    _number(cfg, "fire.static_mask.neighbour_cells", minimum=0, maximum=5, integer=True)
    types = _get(cfg, "fire.static_mask.mask_types")
    if not isinstance(types, list) or not all(isinstance(t, int) and 0 <= t <= 3 for t in types):
        raise ConfigError(f"severity.toml: fire.static_mask.mask_types must be FIRMS types 0-3, got {types!r}")
    _number(cfg, "fire.static_mask.cell_deg", minimum=0.0005, maximum=0.05)
    _number(cfg, "fire.static_mask.min_detections", minimum=1, integer=True)
    years = _get(cfg, "fire.baseline.years")
    if not isinstance(years, list) or not years or not all(isinstance(y, int) for y in years):
        raise ConfigError(f"severity.toml: fire.baseline.years must be a list of years, got {years!r}")
    _number(cfg, "fire.baseline.smooth_weeks", minimum=0, maximum=4, integer=True)
    _number(cfg, "fire.level_2_min_ratio", minimum=1)
    _number(cfg, "fire.level_3_min_ratio", minimum=1)
    _ascending(cfg, "fire.level_2_min_ratio", "fire.level_3_min_ratio")
    _number(cfg, "fire.min_fire_events", minimum=1, integer=True)
    _number(cfg, "fire.gdacs_wildfire_level", minimum=1, maximum=4, integer=True)
    _number(cfg, "fire.level_4_min_frp_mw", minimum=0)
    _number(cfg, "fire.level_4_near_km", minimum=0)
    _number(cfg, "fire.level_4_min_population", minimum=0, integer=True)
    _number(cfg, "fire.calibration_cap", minimum=1, maximum=4, integer=True)
    _number(cfg, "fire.lifecycle.open_min_level", minimum=1, maximum=4, integer=True)
    _number(cfg, "fire.lifecycle.close_after_hours", minimum=1)
