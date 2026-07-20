"""
Best-effort outbound alerting for the pipeline.

Sends a JSON payload to a webhook URL (an n8n workflow webhook, a Slack
incoming webhook, or anything else that accepts a POST). No channel is
required to exist for the pipeline to run: if NOTIFY_WEBHOOK_URL isn't set,
send_alert() logs and returns False instead of raising, so a missing or
broken alert channel can never itself break the run it's trying to report
on, or mask the underlying failure.
"""

import logging
import os

import requests
from dotenv import load_dotenv

load_dotenv()

logger = logging.getLogger(__name__)

NOTIFY_WEBHOOK_URL = os.getenv("NOTIFY_WEBHOOK_URL", "").strip()


def send_alert(subject: str, body: str) -> bool:
    if not NOTIFY_WEBHOOK_URL:
        logger.warning("notify: NOTIFY_WEBHOOK_URL not configured, alert not sent: %s", subject)
        return False
    try:
        resp = requests.post(
            NOTIFY_WEBHOOK_URL,
            json={"source": "sentinel-pipeline", "subject": subject, "body": body},
            timeout=10,
        )
        resp.raise_for_status()
        logger.info("notify: alert sent: %s", subject)
        return True
    except Exception as exc:
        logger.error("notify: failed to send alert: %s", exc)
        return False
