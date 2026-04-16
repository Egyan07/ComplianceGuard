"""
Email delivery for ComplianceGuard.

Sends verification and password-reset emails via SMTP.
Set EMAIL_ENABLED=true and configure SMTP_* env vars to activate.
When EMAIL_ENABLED=false (default) all functions are silent no-ops — safe for dev/test.
"""

import aiosmtplib
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText

from app.core.config import settings


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
    )


async def send_verification_email(email: str, token: str) -> None:
    """Send email verification link. No-op when EMAIL_ENABLED=false."""
    if not settings.email_enabled:
        return

    html = f"""
    <h2>Verify your ComplianceGuard account</h2>
    <p>Click the link below to verify your email address:</p>
    <p><a href="{settings.app_base_url}/api/auth/verify-email?token={token}">
        Verify Email
    </a></p>
    <p>This link does not expire automatically — contact support if you need a new one.</p>
    """
    msg = _build_message(email, "Verify your ComplianceGuard email", html)
    await _smtp_send(msg, email)


async def send_password_reset_email(email: str, token: str) -> None:
    """Send password reset link. No-op when EMAIL_ENABLED=false."""
    if not settings.email_enabled:
        return

    html = f"""
    <h2>Reset your ComplianceGuard password</h2>
    <p>Click the link below to set a new password. This link expires in 1 hour.</p>
    <p><a href="{settings.app_base_url}/api/auth/reset-password?token={token}">
        Reset Password
    </a></p>
    <p>If you did not request a password reset, ignore this email.</p>
    """
    msg = _build_message(email, "Reset your ComplianceGuard password", html)
    await _smtp_send(msg, email)
