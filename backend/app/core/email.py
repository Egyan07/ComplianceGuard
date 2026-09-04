"""
Email delivery for ComplianceGuard.

Sends verification and password-reset emails via SMTP.
Set EMAIL_ENABLED=true and configure SMTP_* env vars to activate.

When EMAIL_ENABLED=false (default) no email is sent:
  - In non-production environments the verification/reset link is LOGGED so
    local / self-hosted development remains usable (you can open the link from
    the backend console). This matches the .env.example documentation.
  - In production this is a fatal misconfiguration: every account requires
    email verification, so with delivery disabled no user can ever complete
    registration (every protected endpoint returns 403). app.main refuses to
    start in that state; callers here still log loudly as a second line of
    defense.
"""

import logging
import aiosmtplib
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText

from app.core.config import settings, Environment

logger = logging.getLogger(__name__)


def _build_message(to: str, subject: str, html_body: str) -> MIMEMultipart:
    msg = MIMEMultipart("alternative")
    msg["Subject"] = subject
    msg["From"] = f"{settings.smtp_from_name} <{settings.smtp_from_email}>"
    msg["To"] = to
    msg.attach(MIMEText(html_body, "html"))
    return msg


async def _smtp_send(msg: MIMEMultipart, to: str) -> None:
    await aiosmtplib.send(
        msg,
        sender=settings.smtp_from_email,
        recipients=[to],
        hostname=settings.smtp_host,
        port=settings.smtp_port,
        username=settings.smtp_user,
        password=settings.smtp_password,
        start_tls=settings.smtp_tls,
        use_tls=settings.smtp_ssl,
        timeout=30,  # bound a hung SMTP server (default is unbounded per-op)
    )


async def send_verification_email(email: str, token: str) -> None:
    """Send email verification link.

    When EMAIL_ENABLED=false the delivery is skipped: in non-production
    environments the link is logged (never silently dropped), in production it
    is logged as an error. Production startup is gated separately in
    app.main._assert_valid_production_config.
    """
    if not settings.email_enabled:
        link = f"{settings.app_base_url}/#/verify-email?token={token}"
        if settings.environment != Environment.PRODUCTION:
            logger.warning(
                "EMAIL_ENABLED=false (no SMTP): verification link for %s -> %s",
                email, link,
            )
        else:
            logger.error(
                "EMAIL_ENABLED=false in production: verification email for %s was NOT "
                "sent (link exists only here: %s). Configure SMTP or this account "
                "cannot be verified.",
                email, link,
            )
        return

    html = f"""
    <h2>Verify your ComplianceGuard account</h2>
    <p>Click the link below to verify your email address:</p>
    <p><a href="{settings.app_base_url}/#/verify-email?token={token}">
        Verify Email
    </a></p>
    <p>This link does not expire automatically — contact support if you need a new one.</p>
    """
    msg = _build_message(email, "Verify your ComplianceGuard email", html)
    await _smtp_send(msg, email)


async def send_password_reset_email(email: str, token: str) -> None:
    """Send password reset link.

    Same disabled-email behavior as send_verification_email: non-production
    logs the reset link so local development stays usable; production logs an
    error (startup is gated separately).
    """
    if not settings.email_enabled:
        link = f"{settings.app_base_url}/#/reset-password?token={token}"
        if settings.environment != Environment.PRODUCTION:
            logger.warning(
                "EMAIL_ENABLED=false (no SMTP): password reset link for %s -> %s",
                email, link,
            )
        else:
            logger.error(
                "EMAIL_ENABLED=false in production: password reset email for %s was NOT sent.",
                email,
            )
        return

    html = f"""
    <h2>Reset your ComplianceGuard password</h2>
    <p>Click the link below to set a new password. This link expires in 1 hour.</p>
    <p><a href="{settings.app_base_url}/#/reset-password?token={token}">
        Reset Password
    </a></p>
    <p>If you did not request a password reset, ignore this email.</p>
    """
    msg = _build_message(email, "Reset your ComplianceGuard password", html)
    await _smtp_send(msg, email)
