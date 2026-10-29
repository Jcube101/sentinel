"""Test-wide guards."""
import pytest

import archive
import config
import datagov


@pytest.fixture(autouse=True)
def no_real_archive(monkeypatch, tmp_path):
    """No test writes the Pi's sentinel_archive.db: archive.py gets a temporary file."""
    monkeypatch.setattr(archive, "DB_PATH", str(tmp_path / "archive.db"))


@pytest.fixture(autouse=True)
def no_real_data_gov_in(monkeypatch):
    """No test reaches data.gov.in: the configured key is dropped (so the air
    stage takes the OpenAQ fallback unless a test passes its own feed), and
    an accidental real request fails at once instead of waiting on the API."""
    monkeypatch.setattr(config, "DATA_GOV_IN_API_KEY", None)

    def blocked(*args, **kwargs):
        raise AssertionError("tests must not call data.gov.in; pass get= or feed=")

    monkeypatch.setattr(datagov.requests, "get", blocked, raising=False)
