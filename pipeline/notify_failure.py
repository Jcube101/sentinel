"""
Entry point for sentinel-pipeline.service's OnFailure= hook.

Runs as a separate unit outside the pipeline process, so it still fires if
pipeline.py fails in a way it can't report on itself: an interpreter crash,
an import error, an OOM kill, or anything else that ends the process before
its own code gets a chance to run. Gathers unit status via `systemctl show`
(no sudo needed for read access) and the tail of the durable logfile, then
sends one alert with no secrets in it.
"""

import os
import subprocess
import sys
from datetime import datetime, timezone

from notify import send_alert

UNIT = "sentinel-pipeline.service"
LOG_FILE = os.path.join(os.path.dirname(os.path.abspath(__file__)), "logs", "pipeline.log")
LOG_TAIL_LINES = 20


def _unit_status() -> str:
    try:
        result = subprocess.run(
            [
                "systemctl", "show", UNIT,
                "-p", "ActiveState,Result,ExecMainStatus,ExecMainStartTimestamp,ExecMainExitTimestamp",
            ],
            capture_output=True, text=True, timeout=10,
        )
        return result.stdout.strip() or "(no status returned)"
    except Exception as exc:
        return f"(systemctl show failed: {exc})"


def _log_tail(n: int = LOG_TAIL_LINES) -> str:
    try:
        with open(LOG_FILE) as f:
            lines = f.readlines()
        return "".join(lines[-n:]) or "(logfile empty)"
    except Exception as exc:
        return f"(could not read {LOG_FILE}: {exc})"


def main() -> int:
    now = datetime.now(timezone.utc).isoformat()
    body = (
        f"{UNIT} failed at {now}\n\n"
        f"--- systemctl show ---\n{_unit_status()}\n\n"
        f"--- last {LOG_TAIL_LINES} log lines ---\n{_log_tail()}"
    )
    send_alert(f"Sentinel pipeline FAILED: {UNIT}", body)
    return 0


if __name__ == "__main__":
    sys.exit(main())
