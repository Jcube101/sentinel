import logging
import time

import requests

logger = logging.getLogger(__name__)

RETRY_BACKOFF_SECONDS = (5, 15)
DEFAULT_TIMEOUT_S = 30  # connect and read, per attempt, unless the caller sets its own


def get_with_retry(source: str, url: str, **kwargs) -> requests.Response:
    """requests.get with retries on timeout/connection errors only.

    2 retries with exponential backoff (~5s, ~15s), same per-attempt timeout
    throughout. 4xx/5xx responses are not retried here — they surface via
    resp.raise_for_status() in the caller. A single transient blip against an
    upstream host must not fail the whole run.
    """
    kwargs.setdefault("timeout", DEFAULT_TIMEOUT_S)
    attempts = len(RETRY_BACKOFF_SECONDS) + 1
    for attempt in range(1, attempts + 1):
        try:
            return requests.get(url, **kwargs)
        except (requests.exceptions.Timeout, requests.exceptions.ConnectionError) as exc:
            if attempt == attempts:
                raise
            delay = RETRY_BACKOFF_SECONDS[attempt - 1]
            logger.warning(
                "%s: request failed (attempt %d/%d) — %s | retrying in %ds",
                source, attempt, attempts, exc, delay,
            )
            time.sleep(delay)
