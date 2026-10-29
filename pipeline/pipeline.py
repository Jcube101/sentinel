import argparse
import logging
import os
import sys
import time
from datetime import datetime, timedelta, timezone
from logging.handlers import RotatingFileHandler

import requests
from dateutil import parser as dateutil_parser
from supabase import Client, create_client

import archive
import notify
import runs
import severity_config
from config import LONG_RETENTION_DAYS, SHORT_RETENTION_DAYS, SUPABASE_SERVICE_KEY, SUPABASE_URL
from fetchers import eonet, firms, gdacs, openaq, usgs

# journald on this host evicts entries after a few hours (unrelated services
# flood it), so a once- or thrice-daily job's logs are gone before anyone can
# read them. A rotating file next to the pipeline is the durable log.
LOG_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), "logs")
LOG_FILE = os.path.join(LOG_DIR, "pipeline.log")

logger = logging.getLogger(__name__)


def _setup_logging() -> None:
    # Called from __main__ only, so importing this module (the tests do)
    # never writes to the live log file.
    os.makedirs(LOG_DIR, exist_ok=True)
    formatter = logging.Formatter(
        fmt="%(asctime)s %(levelname)s %(name)s: %(message)s",
        datefmt="%Y-%m-%dT%H:%M:%S",
    )
    file_handler = RotatingFileHandler(LOG_FILE, maxBytes=5 * 1024 * 1024, backupCount=7)
    file_handler.setFormatter(formatter)
    stream_handler = logging.StreamHandler()
    stream_handler.setFormatter(formatter)
    # force=True: wins over any basicConfig a module we import (e.g. archive.py)
    # already ran at import time, regardless of import order.
    logging.basicConfig(level=logging.INFO, handlers=[stream_handler, file_handler], force=True)


EVENTS_TABLE = "events"
AQI_TABLE = "aqi_readings"
BATCH_SIZE = 500

# FIRMS and USGS produce new rows on a schedule tight enough that "no new
# rows in N days" is itself a real failure signal. Thresholds are set from
# observed history, not guessed: FIRMS is active on ~every UTC day; the
# widest gap seen between active USGS days in the last 50 rows was 7 days,
# so 7 gives one day of margin over the worst quiet week actually observed
# in this bbox/magnitude filter, well short of the old 30-day threshold
# that would have let most of a month pass unnoticed.
DENSE_STALENESS_THRESHOLDS = {
    "FIRMS": timedelta(days=2),
    "USGS": timedelta(days=7),
}
AQI_STALENESS_THRESHOLD = timedelta(hours=48)

# EONET and GDACS are genuinely event-driven: a real quiet stretch and a
# broken fetcher produce an identical "no new rows" signal, so row age is
# not a reliable tripwire for them (EONET's own history has a 28-day gap
# between active days with nothing wrong; the current ~50-day gap was
# confirmed live to be a real lull, not a bug, see AUDIT.md). For these,
# the reliable signal is whether the fetch itself succeeded, which is
# already what fails the run and fires the OnFailure alert; row age is
# still logged for visibility but never triggers a WARNING or a
# staleness notification.
SPARSE_SOURCES = {"EONET", "GDACS"}


def _chunks(lst: list, size: int):
    for i in range(0, len(lst), size):
        yield lst[i : i + size]


def _dedup(rows: list) -> list:
    seen: dict = {}
    for row in rows:
        seen[row["id"]] = row
    return list(seen.values())


# Sources whose timeouts (after the fetcher's own retries) are logged as a
# warning instead of failing the run. GDACS is event-driven, already exempt
# from staleness alerts, and its API has had multi-hour outages where it
# hangs rather than erroring. HTTP/parse errors still fail the run.
SOFT_TIMEOUT_SOURCES = {"GDACS"}

# Sources whose timeout fails the run only when the previous run's fetch of
# the same source timed out too (its sources row's last_status, written by
# that run). One FIRMS timeout (edition 19) left every other stage working,
# with the fire desk's items kept last-known. A longer outage also trips
# the 2-day FIRMS staleness alert. HTTP/parse errors still fail at once.
FAIL_ON_SECOND_TIMEOUT = {"FIRMS"}

FETCHERS = (
    ("FIRMS", firms),
    ("EONET", eonet),
    ("GDACS", gdacs),
    ("USGS", usgs),
    ("OpenAQ", openaq),
)
EVENT_SOURCES = ("FIRMS", "EONET", "GDACS", "USGS")


def _run_fetcher(name: str, module) -> runs.FetchResult:
    """Call module.fetch() and classify the outcome. Never raises.

    result.ok is False when the source should fail the run; result.status
    (ok | empty | timeout | error) feeds the per-source freshness record.
    """
    t0 = time.monotonic()
    rows, extras, error, timed_out = [], {}, None, False
    try:
        # fetch_detailed() = (rows, side data for later stages), when a fetcher has it
        fetch_detailed = getattr(module, "fetch_detailed", None)
        rows, extras = fetch_detailed() if fetch_detailed else (module.fetch(), {})
        logger.info("%s: fetched %d rows", name, len(rows))
    except requests.exceptions.Timeout as exc:
        error, timed_out = exc, True
        if name in SOFT_TIMEOUT_SOURCES:
            logger.warning("%s: timed out, skipping this run (not a failure) — %s", name, exc)
        elif name in FAIL_ON_SECOND_TIMEOUT:
            logger.warning("%s: timed out — %s", name, exc)  # _tolerate_first_timeouts() decides
        else:
            logger.error("%s: fetcher raised an exception — %s", name, exc)
    except Exception as exc:
        error = exc
        logger.error("%s: fetcher raised an exception — %s", name, exc)
    ok, status = runs.classify(name, rows, error, timed_out, name in SOFT_TIMEOUT_SOURCES)
    return runs.FetchResult(
        name=name, rows=rows, ok=ok, status=status,
        error=str(error) if error is not None else None,
        duration_s=time.monotonic() - t0,
        extras=extras,
    )


def _tolerate_first_timeouts(supabase, results: dict[str, runs.FetchResult]) -> None:
    """A FAIL_ON_SECOND_TIMEOUT source's timeout fails the run only if its
    fetch in the previous run timed out too. If the previous status can't be
    read, the timeout fails the run, as before."""
    for name in sorted(FAIL_ON_SECOND_TIMEOUT):
        result = results.get(name)
        if result is None or result.status != "timeout":
            continue
        sid = runs.SOURCE_IDS[name]
        try:
            rows = (supabase.table(runs.SOURCES_TABLE).select("id,last_status")
                    .eq("id", sid).execute().data)
        except Exception as exc:
            logger.error("%s: timed out, and the previous run's status could not be read (%s): "
                         "failing the run", name, exc)
            continue
        if not rows:
            logger.error("%s: timed out, and there is no sources row to compare with: failing the run", name)
            continue
        previous = rows[0].get("last_status")
        if previous == "timeout":
            logger.error("%s: timed out in the previous run too: failing the run", name)
        else:
            result.ok = True
            logger.warning("%s: timed out, but not in the previous run (%s): not failing the run; "
                           "a timeout next run will", name, previous or "no status yet")


def _upsert(supabase, table: str, rows: list, conflict_key: str) -> int:
    if not rows:
        return 0
    upserted = 0
    for batch in _chunks(rows, BATCH_SIZE):
        resp = supabase.table(table).upsert(batch, on_conflict=conflict_key).execute()
        upserted += len(resp.data)
    return upserted


def _cleanup(supabase) -> None:
    now = datetime.now(tz=timezone.utc)
    cutoff_60 = (now - timedelta(days=SHORT_RETENTION_DAYS)).isoformat()
    cutoff_365 = (now - timedelta(days=LONG_RETENTION_DAYS)).isoformat()
    cutoff_7 = (now - timedelta(days=7)).isoformat()

    try:
        resp = supabase.table(EVENTS_TABLE).delete().in_("source", ["FIRMS", "GDACS"]).lt("started_at", cutoff_60).execute()
        logger.info("cleanup: deleted %d high-volume events (FIRMS/GDACS >60 days)", len(resp.data))
    except Exception as exc:
        logger.error("cleanup: events (FIRMS/GDACS) delete failed — %s", exc)

    try:
        resp = supabase.table(EVENTS_TABLE).delete().in_("source", ["EONET", "USGS"]).lt("started_at", cutoff_365).execute()
        logger.info("cleanup: deleted %d low-volume events (EONET/USGS >365 days)", len(resp.data))
    except Exception as exc:
        logger.error("cleanup: events (EONET/USGS) delete failed — %s", exc)

    try:
        resp = supabase.table(AQI_TABLE).delete().lt("recorded_at", cutoff_7).execute()
        logger.info("cleanup: deleted %d aqi_readings (>7 days)", len(resp.data))
    except Exception as exc:
        logger.error("cleanup: aqi_readings delete failed — %s", exc)


def _newest_age(supabase, table: str, date_col: str, **eq_filters) -> timedelta | None:
    query = supabase.table(table).select(date_col)
    for col, val in eq_filters.items():
        query = query.eq(col, val)
    resp = query.order(date_col, desc=True).limit(1).execute()
    if not resp.data:
        return None
    newest = dateutil_parser.parse(resp.data[0][date_col])
    return datetime.now(tz=timezone.utc) - newest


def _check_staleness(supabase, fetch_results: dict) -> None:
    """Log the newest-row age per source; notify Job when a dense source has
    gone stale, or when any source has zero rows on record.

    This is the tripwire that would have caught FIRMS silently ingesting
    nothing for 35 days — every prior run reported "success" with no signal
    that the data itself had stopped moving. A WARNING alone doesn't reach
    anyone, so a breach here also calls notify.send_alert(), not just the log.
    """
    all_sources = {*DENSE_STALENESS_THRESHOLDS, *SPARSE_SOURCES}
    for source in all_sources:
        fetch_ok = fetch_results.get(source)
        try:
            age = _newest_age(supabase, EVENTS_TABLE, "started_at", source=source)
        except Exception as exc:
            logger.error("staleness: check failed for %s: %s", source, exc)
            continue

        if age is None:
            logger.warning("staleness: %s has no rows in events table", source)
            notify.send_alert(
                f"Sentinel: {source} has never ingested any rows",
                f"events table has zero rows for source={source}. Last fetch for this "
                f"run: {'ok' if fetch_ok else 'FAILED'}.",
            )
            continue

        if source in SPARSE_SOURCES:
            # Row age is expected to swing widely for event-driven sources;
            # only a fetch failure (which already fails the run) is a real
            # signal here, so this is INFO-only regardless of age.
            logger.info(
                "staleness: %s newest row is %s old (event-driven source, not alerted on age)",
                source, age,
            )
            continue

        threshold = DENSE_STALENESS_THRESHOLDS[source]
        if age > threshold:
            logger.warning(
                "staleness: %s newest row is %s old (threshold %s)", source, age, threshold
            )
            notify.send_alert(
                f"Sentinel: {source} data is stale",
                f"{source} newest row is {age} old, threshold is {threshold}. "
                f"Last fetch for this run: {'ok' if fetch_ok else 'FAILED'}.",
            )
        else:
            logger.info("staleness: %s newest row is %s old (ok)", source, age)

    try:
        age = _newest_age(supabase, AQI_TABLE, "recorded_at")
    except Exception as exc:
        logger.error("staleness: check failed for aqi_readings: %s", exc)
        return
    if age is None:
        logger.warning("staleness: aqi_readings has no rows")
        notify.send_alert(
            "Sentinel: aqi_readings has never ingested any rows",
            f"aqi_readings table has zero rows. Last OpenAQ fetch for this run: "
            f"{'ok' if fetch_results.get('OpenAQ') else 'FAILED'}.",
        )
    elif age > AQI_STALENESS_THRESHOLD:
        logger.warning(
            "staleness: aqi_readings newest row is %s old (threshold %s)",
            age, AQI_STALENESS_THRESHOLD,
        )
        notify.send_alert(
            "Sentinel: aqi_readings data is stale",
            f"aqi_readings newest row is {age} old, threshold is {AQI_STALENESS_THRESHOLD}. "
            f"Last OpenAQ fetch for this run: {'ok' if fetch_results.get('OpenAQ') else 'FAILED'}.",
        )
    else:
        logger.info("staleness: aqi_readings newest row is %s old (ok)", age)


def _log_dry_run_freshness(supabase, results: dict) -> None:
    """Dry run: log what the freshness record would say, write nothing."""
    try:
        previous = runs.read_previous(supabase)
    except Exception as exc:
        logger.warning("dry-run: could not read source freshness (is migration 001 applied?) — %s", exc)
        previous = {}
    written = {name: True for name in results}
    _, summary = runs.source_updates(results, written, previous, None, datetime.now(tz=timezone.utc))
    for sid, s in summary.items():
        logger.info(
            "dry-run: %s freshness would be status=%s rows=%d new_data=%s newest=%s",
            sid, s["status"], s["rows"], s["new_data"], s["newest_observation_at"],
        )


def run(dry_run: bool = False):
    start = time.monotonic()
    started_at = datetime.now(tz=timezone.utc)
    supabase: Client = create_client(SUPABASE_URL, SUPABASE_SERVICE_KEY)

    # Run record + source freshness (runs.py). A failure here fails the run,
    # so it alerts, but never stops the events / aqi_readings writes.
    runs_ok = True

    # The thresholds this edition runs with: stored on its run record and
    # handed to every severity stage, so the record is exactly what they used.
    # If severity.toml doesn't load, each stage fails on it as before.
    try:
        edition_cfg = severity_config.load()
    except Exception as exc:
        logger.error("severity.toml did not load, the severity stages will fail — %s", exc)
        edition_cfg = None

    # --- Run record: id is the edition number ---
    run_id = None
    if dry_run:
        logger.info("dry-run: skipping run record")
    else:
        try:
            run_id = runs.start_run(supabase, started_at, severity_config=edition_cfg)
            logger.info("runs: started edition %d", run_id)
        except Exception as exc:
            logger.error("runs: could not create run record — %s", exc)
            runs_ok = False

    # --- Run fetchers ---
    results = {name: _run_fetcher(name, module) for name, module in FETCHERS}
    _tolerate_first_timeouts(supabase, results)
    any_failure = not all(result.ok for result in results.values())
    # For the staleness alerts' "last fetch" line: whether data came back, even when a
    # timeout didn't fail the run.
    fetch_results = {name: result.status in ("ok", "empty") for name, result in results.items()}

    # --- Write events ---
    all_events = _dedup([row for name in EVENT_SOURCES for row in results[name].rows])
    events_written = False
    if dry_run:
        logger.info("dry-run: skipping events upsert (%d rows would be written)", len(all_events))
        events_upserted = 0
    else:
        try:
            events_upserted = _upsert(supabase, EVENTS_TABLE, all_events, "id")
            events_written = True
            logger.info("events: upserted %d rows", events_upserted)
        except Exception as exc:
            logger.error("events: upsert failed — %s", exc)
            events_upserted = 0
            any_failure = True

    # --- Write AQI readings ---
    openaq_rows = results["OpenAQ"].rows
    aqi_written = False
    if dry_run:
        logger.info("dry-run: skipping aqi_readings upsert (%d rows would be written)", len(openaq_rows))
        aqi_upserted = 0
    else:
        try:
            aqi_upserted = _upsert(supabase, AQI_TABLE, openaq_rows, "location_id,parameter,recorded_at")
            aqi_written = True
            logger.info("aqi_readings: upserted %d rows", aqi_upserted)
        except Exception as exc:
            logger.error("aqi_readings: upsert failed — %s", exc)
            aqi_upserted = 0
            any_failure = True

    # --- Source freshness (last good fetch, newest observation, new data) ---
    sources_summary = None
    if dry_run:
        _log_dry_run_freshness(supabase, results)
    else:
        written = {name: aqi_written if name == "OpenAQ" else events_written for name in results}
        try:
            sources_summary = runs.record_sources(
                supabase, run_id, results, written, datetime.now(tz=timezone.utc)
            )
            logger.info(
                "runs: recorded freshness (new data from: %s)",
                ", ".join(sid for sid, s in sources_summary.items() if s["new_data"]) or "none",
            )
        except Exception as exc:
            logger.error("runs: could not record source freshness — %s", exc)
            runs_ok = False

    # --- Fire events: hotspots clustered and placed in districts (fire.py) ---
    fire_rows = None
    if dry_run or run_id is not None:
        try:
            import fire  # needs shapely; a broken import fails only this stage

            summary = fire.run_fire(supabase, run_id, results, datetime.now(tz=timezone.utc), write=not dry_run,
                                   cfg=edition_cfg)
            fire_rows = summary.get("rows")
            if "skipped" in summary:
                logger.warning("fire: skipped — %s", summary["skipped"])
            else:
                logger.info(
                    "%sfire: %d hotspots (%d masked as static) -> %d fire events in %d districts, %d states "
                    "for %s; %d superseded rows removed; top: %s",
                    "dry-run: " if dry_run else "", summary["hotspots"], summary["masked"],
                    summary["fire_events"], summary["districts"], summary["states"],
                    ", ".join(summary["dates"]), summary["superseded"], "; ".join(summary["top_districts"]),
                )
        except Exception as exc:
            logger.error("fire: failed — %s", exc)
            runs_ok = False
    else:
        logger.error("fire: skipped, no run record")

    # Severity stage summaries for the quiet-day stage; None = the stage failed.
    stages = {"fire_desk": None, "desk": None, "air": None}

    # --- Fire desk items: one per state, level from ratio to norm (fire_desk.py) ---
    if dry_run or run_id is not None:
        try:
            import fire_desk

            summary = fire_desk.run_fire_desk(
                supabase, run_id, results, datetime.now(tz=timezone.utc), rows=fire_rows, write=not dry_run,
                cfg=edition_cfg)
            stages["fire_desk"] = summary
            prefix = "dry-run: " if dry_run else ""
            if summary.get("restored"):
                logger.warning("%sfire desk: levelled on an incomplete day, restored to the last complete day: %s",
                               prefix, ", ".join(summary["restored"]))
            if summary["source_good"]:
                logger.info(
                    "%sfire desk: %s assessed, %d states; open: %s; changes: %s; top ratios: %s%s",
                    prefix, summary["day"], summary["assessed"], ", ".join(summary["open"]) or "none",
                    summary["changes"] or "none", "; ".join(summary["top_ratios"]) or "none",
                    f"; {summary['unmatched_alerts']} GDACS wildfire alert(s) outside India's districts"
                    if summary["unmatched_alerts"] else "",
                )
            else:
                logger.warning("%sfire desk: no new levels (%s); open items kept as last-known: %s",
                               prefix, summary["note"], ", ".join(summary["open"]) or "none")
        except Exception as exc:
            logger.error("fire desk: failed — %s", exc)
            runs_ok = False

    # --- Severity desk: levels, open/close rules, per-run snapshots (desk.py) ---
    if dry_run or run_id is not None:
        try:
            # Imported here: desk needs shapely, and a broken import must only
            # fail this stage, never the events / aqi_readings writes above.
            import desk

            summary = desk.run_desk(supabase, run_id, results, datetime.now(tz=timezone.utc), write=not dry_run,
                                   cfg=edition_cfg)
            stages["desk"] = summary
            logger.info(
                "%sdesk: %d open (max level %s, %d last-known), changes: %s",
                "dry-run: " if dry_run else "", summary["open"], summary["max_level"],
                summary["last_known"], summary["changes"] or "none",
            )
        except Exception as exc:
            logger.error("desk: failed — %s", exc)
            runs_ok = False
    else:
        logger.error("desk: skipped, no run record to attach snapshots to")

    # --- National air-quality item (air.py): data.gov.in feed, OpenAQ fallback, own stage ---
    if dry_run or run_id is not None:
        try:
            import air

            summary = air.run_air(supabase, run_id, results, datetime.now(tz=timezone.utc), write=not dry_run,
                                 cfg=edition_cfg)
            stages["air"] = summary
            if summary.get("datagov") and sources_summary is not None:
                sources_summary["DATAGOV"] = summary["datagov"]  # into pipeline_runs.sources
            prefix = "dry-run: " if dry_run else ""
            if summary["fallback_reason"]:
                logger.warning("%sair: data.gov.in not used (%s), trying OpenAQ", prefix, summary["fallback_reason"])
            if summary["source_good"]:
                logger.info(
                    "%sair: level %s (%s), source %s, change: %s, %d requests, %d stations, %d cities",
                    prefix, summary["level"], summary["reason"] or "nothing Poor or worse", summary["source"],
                    summary["change"] or "none", summary["requests"], summary["stations"], summary["fresh_cities"],
                )
            else:
                logger.warning(
                    "%sair: no new level (%s); any open item kept as last-known, %d requests",
                    prefix, summary["note"], summary["requests"],
                )
        except Exception as exc:
            logger.error("air: failed — %s", exc)
            runs_ok = False

    # --- Quiet-day desk: watching list + per-category status (watch.py) ---
    if dry_run or run_id is not None:
        try:
            import watch

            summary = watch.run_quiet(supabase, run_id, results, datetime.now(tz=timezone.utc), stages,
                                      write=not dry_run, cfg=edition_cfg)
            logger.info(
                "%squiet: status %s; watching %d of %d: %s",
                "dry-run: " if dry_run else "",
                ", ".join(f"{c} {s}" for c, s in summary["status"].items()),
                len(summary["watching"]), summary["subjects"], "; ".join(summary["watching"]) or "none",
            )
        except Exception as exc:
            logger.error("quiet: failed — %s", exc)
            runs_ok = False

    duration = time.monotonic() - start

    print("")
    print("=== Sentinel Pipeline Run ===" + (" (DRY RUN)" if dry_run else ""))
    print(f"  FIRMS:   {len(results['FIRMS'].rows)} events")
    print(f"  EONET:   {len(results['EONET'].rows)} events")
    print(f"  GDACS:   {len(results['GDACS'].rows)} events")
    print(f"  USGS:    {len(results['USGS'].rows)} earthquakes")
    print(f"  OpenAQ:  {len(openaq_rows)} readings")
    print(f"  Total events upserted:       {events_upserted}")
    print(f"  Total AQI readings upserted: {aqi_upserted}")
    print(f"  Duration: {duration:.1f}s")
    print("============================")

    # --- Archive before cleanup, so cleanup can never delete un-archived data ---
    # archive.run() only reads from Supabase and writes locally (INSERT OR
    # REPLACE — idempotent), so it's safe to actually run under --dry-run too;
    # only the destructive _cleanup() step below is gated on dry_run.
    try:
        archive_exit = archive.run()
        archive_ok = archive_exit == 0
        if not archive_ok:
            logger.error("archive: run exited %d — skipping cleanup this run", archive_exit)
    except Exception as exc:
        logger.error("archive: run raised an exception: %s, skipping cleanup this run", exc)
        archive_ok = False

    if not archive_ok:
        any_failure = True

    if dry_run:
        logger.info("dry-run: skipping cleanup")
    elif not archive_ok:
        logger.warning("cleanup: skipped, archive did not complete successfully")
    else:
        _cleanup(supabase)

    _check_staleness(supabase, fetch_results)

    # --- Close the run record ---
    if run_id is not None:
        try:
            runs.finish_run(
                supabase, run_id,
                status="failed" if (any_failure or not runs_ok) else "ok",
                finished_at=datetime.now(tz=timezone.utc),
                duration_s=time.monotonic() - start,
                events_upserted=events_upserted,
                aqi_upserted=aqi_upserted,
                sources=sources_summary,
            )
        except Exception as exc:
            logger.error("runs: could not close run record %d — %s", run_id, exc)
            runs_ok = False

    return 1 if (any_failure or not runs_ok) else 0


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Sentinel disaster data pipeline")
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Run fetchers and report counts only; skip Supabase writes and cleanup",
    )
    args = parser.parse_args()
    _setup_logging()
    sys.exit(run(dry_run=args.dry_run))
