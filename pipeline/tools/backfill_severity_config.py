"""Backfill pipeline_runs.severity_config for editions run before the pipeline
stored it (P3, migration 008): severity.toml as the main checkout had it when
each run started.

The timer runs whatever the main checkout has checked out, and that
checkout's HEAD reflog dates every change, so each edition's commit is the
last reflog entry before its started_at. Stored with a "_backfill" key:
{"commit", "certain", "note"}. Not certain when HEAD moved during the run to
a commit with a different severity.toml (stages loaded the file one by
one), or when the run didn't start at a timer time (a manual run, assumed
to be from the main checkout).

Dry run by default: prints each edition's commit. --write updates only rows
whose severity_config is still null, and never inserts. From pipeline/:

    PYTHONPATH=. .venv/bin/python tools/backfill_severity_config.py \\
        --repo /home/jcube/projects/sentinel --through 28 [--write]
"""
import argparse
import subprocess
import sys
import tomllib
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone

TIMER_HOURS_UTC = (9, 15, 21)
TIMER_SLACK = timedelta(minutes=2)
TOML_PATH = "pipeline/severity.toml"


@dataclass
class Move:
    at: datetime
    commit: str
    action: str


def parse_reflog(text: str) -> list[Move]:
    """Lines of `git reflog --date=iso-strict --format=%H|%gd|%gs HEAD`, oldest first."""
    moves = []
    for line in text.splitlines():
        if not line.strip():
            continue
        commit, selector, action = line.split("|", 2)
        at = datetime.fromisoformat(selector[selector.index("{") + 1:selector.rindex("}")])
        moves.append(Move(at.astimezone(timezone.utc), commit, action))
    return sorted(moves, key=lambda m: m.at)


def read_reflog(repo: str) -> list[Move]:
    out = subprocess.run(["git", "-C", repo, "reflog", "--date=iso-strict", "--format=%H|%gd|%gs", "HEAD"],
                         check=True, capture_output=True, text=True).stdout
    return parse_reflog(out)


def toml_at(repo: str, commit: str) -> str | None:
    done = subprocess.run(["git", "-C", repo, "show", f"{commit}:{TOML_PATH}"], capture_output=True, text=True)
    return done.stdout if done.returncode == 0 else None


def is_timer_run(started: datetime) -> bool:
    return any(abs(started - started.replace(hour=h, minute=0, second=0, microsecond=0)) <= TIMER_SLACK
               for h in TIMER_HOURS_UTC)


def plan(run: dict, moves: list[Move], show) -> dict | None:
    """The config to store for one run, or None when there is none to find.
    show: commit -> severity.toml text (None if the commit has no such file)."""
    started = datetime.fromisoformat(run["started_at"])
    finished = datetime.fromisoformat(run["finished_at"]) if run.get("finished_at") else started
    before = [m for m in moves if m.at <= started]
    if not before:
        return None
    commit = before[-1].commit
    text = show(commit)
    if text is None:
        return None
    notes, certain = [], True
    during = [m for m in moves if started < m.at <= finished]
    if any(show(m.commit) != text for m in during):
        certain = False
        notes.append("HEAD moved during the run to a different severity.toml: "
                     + ", ".join(f"{m.commit[:7]} at {m.at:%H:%M:%S} UTC" for m in during))
    if not is_timer_run(started):
        certain = False
        moved = started - before[-1].at
        notes.append(f"manual run, assumed from the main checkout ({before[-1].action!r} "
                     f"{int(moved.total_seconds())} s before it started)")
    cfg = tomllib.loads(text)
    cfg["_backfill"] = {"commit": commit, "certain": certain, "note": "; ".join(notes) or None}
    return cfg


def main(argv=None) -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--repo", required=True, help="the main checkout (the one the timer runs)")
    ap.add_argument("--through", type=int, required=True, help="last edition to backfill")
    ap.add_argument("--write", action="store_true", help="update pipeline_runs (default: print only)")
    args = ap.parse_args(argv)

    from supabase import create_client

    import config

    supabase = create_client(config.SUPABASE_URL, config.SUPABASE_SERVICE_KEY)
    runs = (supabase.table("pipeline_runs").select("id,started_at,finished_at,severity_config")
            .lte("id", args.through).order("id").execute().data)
    moves = read_reflog(args.repo)
    cache = {}

    def show(commit):
        if commit not in cache:
            cache[commit] = toml_at(args.repo, commit)
        return cache[commit]

    for run in runs:
        if run["severity_config"] is not None:
            print(f"edition {run['id']}: already stored, left as is")
            continue
        cfg = plan(run, moves, show)
        if cfg is None:
            print(f"edition {run['id']}: no severity.toml found, left null")
            continue
        b = cfg["_backfill"]
        print(f"edition {run['id']} ({run['started_at'][:16]}): {b['commit'][:7]}"
              + ("" if b["certain"] else f", not certain: {b['note']}"))
        if args.write:
            (supabase.table("pipeline_runs").update({"severity_config": cfg})
             .eq("id", run["id"]).is_("severity_config", "null").execute())
    if not args.write:
        print("dry run: nothing written (--write to store)")
    return 0


if __name__ == "__main__":
    sys.exit(main())
