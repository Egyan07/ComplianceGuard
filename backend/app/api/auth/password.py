"""Password reset auth routes: forgot-password, reset-password."""

from datetime import timedelta, datetime, timezone
import asyncio
import secrets
import logging

from fastapi import APIRouter, Depends, HTTPException, status, Request

from app.core.rate_limit import limiter
from app.core.auth import get_password_hash
from app.models.user import User
from app.models.refresh_token import RefreshToken
from app.core.database import get_db
from app.core.email import send_password_reset_email
from sqlalchemy.orm import Session

from app.api.auth.helpers import validate_password_strength
from app.api.auth.schemas import ForgotPasswordRequest, ResetPasswordRequest

router = APIRouter()


@router.post("/forgot-password")
@limiter.limit("3/minute")
async def forgot_password(
    request: Request,
    request_data: ForgotPasswordRequest,
    db: Session = Depends(get_db),
):
    """
    Generate a password reset token.
    In production, this token would be sent via email.
    Always returns 200 to avoid leaking whether the email exists.
    """
    user = db.query(User).filter(User.email == request_data.email).first()
    if user:
        user.reset_token = secrets.token_urlsafe(32)
        user.reset_token_expires = datetime.now(timezone.utc) + timedelta(hours=1)
        db.commit()
        # Send reset email (no-op if EMAIL_ENABLED=false)
        # SMTP failures are logged but must not surface to the client
        try:
            await send_password_reset_email(user.email, user.reset_token)
        except Exception:
            logging.getLogger(__name__).error(
                "Failed to send reset email to %s", user.email, exc_info=True
            )

    return {"message": "If an account with that email exists, a reset link has been sent"}


@router.post("/reset-password")
@limiter.limit("5/minute")
async def reset_password(
    request: Request,
    request_data: ResetPasswordRequest,
    db: Session = Depends(get_db),
):
    """Reset password using a valid reset token."""
    user = db.query(User).filter(User.reset_token == request_data.token).first()

    if not user or not user.reset_token_expires:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid or expired reset token",
        )

    reset_expires = user.reset_token_expires
    # Normalize to UTC without discarding an existing stored offset.
    # .replace() would silently overwrite a tz-aware datetime's tzinfo;
    # use .astimezone() when the value is already tz-aware.
    if reset_expires.tzinfo is not None:
        expires_utc = reset_expires.astimezone(timezone.utc)
    else:
        expires_utc = reset_expires.replace(tzinfo=timezone.utc)
    if datetime.now(timezone.utc) > expires_utc:
        user.reset_token = None
        user.reset_token_expires = None
        db.commit()
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid or expired reset token",
        )

    errors = validate_password_strength(request_data.new_password)
    if errors:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Password must contain {', '.join(errors)}",
        )

    user.hashed_password = await asyncio.to_thread(get_password_hash, request_data.new_password)
    user.reset_token = None
    user.reset_token_expires = None
    # Revoke all of the user's active refresh tokens — a password reset must
    # evict any attacker already holding a refresh token, otherwise the reset
    # does not contain the compromise.
    db.query(RefreshToken).filter(
        RefreshToken.user_id == user.id,
        RefreshToken.revoked_at.is_(None),
    ).update({"revoked_at": datetime.now(timezone.utc)}, synchronize_session=False)
    db.commit()

    return {"message": "Password reset successfully"}
