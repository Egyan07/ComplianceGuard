"""Regression: outbound calls must have bounded timeouts.

A hung AWS endpoint or SMTP server otherwise blocks the request (and, since the
handlers are async-on-the-event-loop with sync I/O, the whole worker) for the
library default (~60s boto3 / unbounded smtp).
"""
import asyncio
from email.mime.multipart import MIMEMultipart

import app.core.email as email_mod
from app.integrations.aws import AWSEvidenceCollector


def test_boto_clients_have_bounded_timeouts():
    c = AWSEvidenceCollector("AKIAEXAMPLE000000000", "secret-key", "us-east-1")
    for client in (c.s3_client, c.iam_client):
        assert client.meta.config.connect_timeout == 5
        assert client.meta.config.read_timeout == 30
        assert client.meta.config.retries.get("mode") == "standard"


def test_smtp_send_passes_timeout(monkeypatch):
    captured = {}

    async def fake_send(msg, **kwargs):
        captured.update(kwargs)

    monkeypatch.setattr(email_mod.aiosmtplib, "send", fake_send)
    asyncio.run(email_mod._smtp_send(MIMEMultipart(), "user@example.com"))
    assert captured.get("timeout") == 30
