"""Tests for the email delivery service."""
import pytest
from unittest.mock import AsyncMock, patch, MagicMock


@pytest.mark.asyncio
async def test_send_verification_skips_when_disabled():
    """When EMAIL_ENABLED=False, no SMTP connection is made."""
    with patch("app.core.email.settings") as mock_settings:
        mock_settings.email_enabled = False
        from app.core.email import send_verification_email
        # Should complete without raising even though SMTP is not configured
        await send_verification_email("user@example.com", "token123")


@pytest.mark.asyncio
async def test_send_verification_calls_smtp():
    """When EMAIL_ENABLED=True, aiosmtplib.send is called with the right recipient."""
    with patch("app.core.email.settings") as mock_settings:
        mock_settings.email_enabled = True
        mock_settings.smtp_host = "smtp.example.com"
        mock_settings.smtp_port = 587
        mock_settings.smtp_user = "user"
        mock_settings.smtp_password = "pass"
        mock_settings.smtp_from_email = "noreply@cg.com"
        mock_settings.smtp_from_name = "ComplianceGuard"
        mock_settings.smtp_tls = True
        mock_settings.smtp_ssl = False

        with patch("app.core.email.aiosmtplib.send", new_callable=AsyncMock) as mock_send:
            mock_send.return_value = ({}, "")
            from app.core.email import send_verification_email
            await send_verification_email("user@example.com", "abc123")
            mock_send.assert_called_once()
            msg = mock_send.call_args[0][0]
            assert "user@example.com" in msg["To"]


@pytest.mark.asyncio
async def test_send_reset_skips_when_disabled():
    """When EMAIL_ENABLED=False, password reset email is silently skipped."""
    with patch("app.core.email.settings") as mock_settings:
        mock_settings.email_enabled = False
        from app.core.email import send_password_reset_email
        await send_password_reset_email("user@example.com", "resettoken")


@pytest.mark.asyncio
async def test_send_reset_calls_smtp():
    """When EMAIL_ENABLED=True, aiosmtplib.send is called for reset email."""
    with patch("app.core.email.settings") as mock_settings:
        mock_settings.email_enabled = True
        mock_settings.smtp_host = "smtp.example.com"
        mock_settings.smtp_port = 587
        mock_settings.smtp_user = "user"
        mock_settings.smtp_password = "pass"
        mock_settings.smtp_from_email = "noreply@cg.com"
        mock_settings.smtp_from_name = "ComplianceGuard"
        mock_settings.smtp_tls = True
        mock_settings.smtp_ssl = False

        with patch("app.core.email.aiosmtplib.send", new_callable=AsyncMock) as mock_send:
            mock_send.return_value = ({}, "")
            from app.core.email import send_password_reset_email
            await send_password_reset_email("user@example.com", "resettoken")
            mock_send.assert_called_once()
            msg = mock_send.call_args[0][0]
            assert "user@example.com" in msg["To"]
