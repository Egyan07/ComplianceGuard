"""Shared helpers for the auth package: refresh-cookie handling, refresh-token
issuance with DB persistence, and password-strength validation."""

from datetime import timedelta, datetime, timezone
import re
import uuid

from fastapi import Response

from app.core.auth import (
    create_refresh_token,
    REFRESH_TOKEN_EXPIRE_DAYS,
)
from app.core.config import settings
from app.models.refresh_token import RefreshToken
from sqlalchemy.orm import Session


# Refresh token is delivered to web clients as an HttpOnly cookie (not readable
# by JS → not exfiltratable via XSS). Same-origin only, so SameSite=Strict. It's
# also still returned in the login/register JSON body for the Electron desktop
# client, which stores it in the OS keychain (not XSS-exposed).
REFRESH_COOKIE_NAME = "refresh_token"
REFRESH_COOKIE_PATH = "/api/v1/auth"


def _set_refresh_cookie(response: Response, token: str) -> None:
    response.set_cookie(
        key=REFRESH_COOKIE_NAME,
        value=token,
        httponly=True,
        secure=not settings.debug,  # False over http in dev/test; True (https) in prod
        samesite="strict",
        path=REFRESH_COOKIE_PATH,
        max_age=REFRESH_TOKEN_EXPIRE_DAYS * 24 * 60 * 60,
    )


def _clear_refresh_cookie(response: Response) -> None:
    response.delete_cookie(REFRESH_COOKIE_NAME, path=REFRESH_COOKIE_PATH)


def _issue_refresh_token(user_id: int, sub: str, db: Session, family_id: str | None = None) -> str:
    """Create a refresh token JWT and persist its jti to the DB for revocation support.

    Rotation (Phase 11): each login starts a new family (uuid4). A refresh keeps
    the same family so reuse of a rotated token can be detected and the whole
    family revoked.
    """
    token, jti = create_refresh_token({"sub": sub})
    expires_at = datetime.now(timezone.utc) + timedelta(days=REFRESH_TOKEN_EXPIRE_DAYS)
    db.add(RefreshToken(
        jti=jti,
        user_id=user_id,
        family_id=family_id or uuid.uuid4().hex,
        expires_at=expires_at,
    ))
    return token


def validate_password_strength(password: str) -> list[str]:
    """Return list of unmet password requirements. Empty list means password is valid."""
    errors = []
    if len(password) < settings.password_min_length:
        errors.append(f"at least {settings.password_min_length} characters")
    if settings.password_require_uppercase and not re.search(r"[A-Z]", password):
        errors.append("an uppercase letter")
    if settings.password_require_lowercase and not re.search(r"[a-z]", password):
        errors.append("a lowercase letter")
    if settings.password_require_digits and not re.search(r"\d", password):
        errors.append("a digit")
    if settings.password_require_special and not re.search(r"[^A-Za-z0-9]", password):
        errors.append("a special character")
    return errors
