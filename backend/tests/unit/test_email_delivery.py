"""
CG-H1 unit tests for email configuration and delivery behavior.

Covers the three deployment states:
  - production + EMAIL_ENABLED=false  -> refuse to boot (startup gate)
  - non-production + EMAIL_ENABLED=false -> log the link, never silently drop it
  - EMAIL_ENABLED=true -> actually send via SMTP

NOTE on capture: these tests attach their own logging.Handler to the
``app.core.email`` logger rather than using pytest's caplog. caplog installs
its handler on the ROOT logger, and app.core.observability.configure_logging
(triggered whenever ``app.main`` is imported earlier in the same session)
replaces root handlers — so caplog.text silently goes empty after that import.
"""

import logging

import pytest

from app.core.config import Settings, Environment, assert_email_configuration_allows_onboarding
import app.core.email as email_mod


class _ListHandler(logging.Handler):
    """Collects formatted log messages emitted by the logger it is attached to."""

    def __init__(self):
        super().__init__(logging.WARNING)
        self.messages: list[str] = []

    def emit(self, record):
        self.messages.append(record.getMessage())


@pytest.fixture
def email_logs():
    """Capture WARNING+ records from the app.core.email logger."""
    logger = logging.getLogger("app.core.email")
    handler = _ListHandler()
    prev_level = logger.level
    prev_disabled = logger.disabled
    logger.addHandler(handler)
    logger.setLevel(logging.WARNING)
    logger.disabled = False
    yield handler
    logger.removeHandler(handler)
    logger.setLevel(prev_level)
    logger.disabled = prev_disabled


@pytest.fixture
def prod_settings(monkeypatch):
    """A Settings instance in production mode with a valid secret key."""
    monkeypatch.setenv("SECRET_KEY", "test-secret-for-validator")
    return Settings(environment=Environment.PRODUCTION, _env_file=None)


class TestProductionStartupGate:
    def test_production_without_email_refuses_to_boot(self, prod_settings):
        prod_settings.email_enabled = False
        with pytest.raises(RuntimeError, match="EMAIL_ENABLED=false"):
            assert_email_configuration_allows_onboarding(prod_settings)

    def test_production_with_email_boots(self, prod_settings):
        prod_settings.email_enabled = True
        # Must not raise.
        assert_email_configuration_allows_onboarding(prod_settings)

    def test_development_with_email_disabled_is_allowed(self, prod_settings):
        prod_settings.environment = Environment.DEVELOPMENT
        prod_settings.email_enabled = False
        # Non-production may run without SMTP (links are logged instead).
        assert_email_configuration_allows_onboarding(prod_settings)


class TestEmailDisabledBehavior:
    @pytest.mark.asyncio
    async def test_verification_link_is_logged_not_dropped(self, monkeypatch, email_logs):
        settings = Settings(environment=Environment.TESTING, email_enabled=False, _env_file=None)
        monkeypatch.setattr(email_mod, "settings", settings)

        await email_mod.send_verification_email("dev@example.com", "tok123")

        assert any("dev@example.com" in m and "verify-email?token=tok123" in m
                   for m in email_logs.messages)

    @pytest.mark.asyncio
    async def test_reset_link_is_logged_not_dropped(self, monkeypatch, email_logs):
        settings = Settings(environment=Environment.TESTING, email_enabled=False, _env_file=None)
        monkeypatch.setattr(email_mod, "settings", settings)

        await email_mod.send_password_reset_email("dev@example.com", "rst456")

        assert any("dev@example.com" in m and "reset-password?token=rst456" in m
                   for m in email_logs.messages)

    @pytest.mark.asyncio
    async def test_production_disabled_logs_error_but_send_is_still_skipped(self, monkeypatch, email_logs):
        monkeypatch.setenv("SECRET_KEY", "test-secret-for-validator")
        settings = Settings(
            environment=Environment.PRODUCTION, email_enabled=False, _env_file=None
        )
        monkeypatch.setattr(email_mod, "settings", settings)
        monkeypatch.setattr(email_mod.aiosmtplib, "send", _fail_if_called)

        await email_mod.send_verification_email("prod@example.com", "tok999")

        assert any("EMAIL_ENABLED=false in production" in m for m in email_logs.messages)


class TestEmailEnabledBehavior:
    @pytest.mark.asyncio
    async def test_verification_email_sent_via_smtp(self, monkeypatch):
        settings = Settings(environment=Environment.TESTING, email_enabled=True, _env_file=None)
        monkeypatch.setattr(email_mod, "settings", settings)

        sent = {}
        async def fake_send(message, sender, recipients, **kwargs):
            sent["sender"] = sender
            sent["recipients"] = recipients
            sent["subject"] = message["Subject"]
            # MIME parts are transfer-encoded; decode before asserting.
            body_parts = []
            for part in message.walk():
                payload = part.get_payload(decode=True)
                if payload:
                    body_parts.append(payload.decode("utf-8", errors="ignore"))
            sent["body"] = "\n".join(body_parts)

        monkeypatch.setattr(email_mod.aiosmtplib, "send", fake_send)

        await email_mod.send_verification_email("user@example.com", "smtptok")

        assert sent["recipients"] == ["user@example.com"]
        assert "smtptok" in sent["body"]

    @pytest.mark.asyncio
    async def test_reset_email_sent_via_smtp(self, monkeypatch):
        settings = Settings(environment=Environment.TESTING, email_enabled=True, _env_file=None)
        monkeypatch.setattr(email_mod, "settings", settings)

        sent = {}
        async def fake_send(message, sender, recipients, **kwargs):
            sent["recipients"] = recipients
            body_parts = []
            for part in message.walk():
                payload = part.get_payload(decode=True)
                if payload:
                    body_parts.append(payload.decode("utf-8", errors="ignore"))
            sent["body"] = "\n".join(body_parts)

        monkeypatch.setattr(email_mod.aiosmtplib, "send", fake_send)

        await email_mod.send_password_reset_email("user@example.com", "rsttok")

        assert sent["recipients"] == ["user@example.com"]
        assert "rsttok" in sent["body"]


async def _fail_if_called(*args, **kwargs):
    raise AssertionError("aiosmtplib.send must NOT be called when email is disabled")
