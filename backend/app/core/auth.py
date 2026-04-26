"""
Authentication service for ComplianceGuard.

This module provides authentication functionality including password hashing
and JWT token generation/validation.
"""

import secrets
from datetime import datetime, timedelta, timezone
from typing import Optional

import bcrypt
import jwt
from jwt.exceptions import InvalidTokenError
from pydantic import BaseModel

from app.models.user import User
from app.core.config import settings


# JWT configuration — resolved lazily via settings at call time so that test
# env-var overrides (e.g. monkeypatched SECRET_KEY) are always respected.
# Capturing at module import broke conftest fixtures that change the secret
# after import. Callers read via the helpers below instead of top-level
# constants.
ALGORITHM = settings.algorithm
ACCESS_TOKEN_EXPIRE_MINUTES = settings.access_token_expire_minutes
REFRESH_TOKEN_EXPIRE_DAYS = settings.refresh_token_expire_days


def _secret_key() -> str:
    return settings.secret_key


class TokenPayload(BaseModel):
    """Token payload model."""
    sub: Optional[str] = None
    jti: Optional[str] = None


def verify_password(plain_password: str, hashed_password: str) -> bool:
    """Verify a plain password against a hashed password."""
    return bcrypt.checkpw(
        plain_password.encode("utf-8"),
        hashed_password.encode("utf-8")
    )


def get_password_hash(password: str) -> str:
    """Generate a bcrypt hash from a plain password."""
    return bcrypt.hashpw(
        password.encode("utf-8"),
        bcrypt.gensalt()
    ).decode("utf-8")


def authenticate_user(db, email: str, password: str) -> Optional[User]:
    """Authenticate a user with email and password."""
    db_user = db.query(User).filter(User.email == email).first()
    if not db_user:
        return None
    if not verify_password(password, db_user.hashed_password):
        return None
    return db_user


def create_access_token(data: dict, expires_delta: Optional[timedelta] = None) -> str:
    """Create a JWT access token."""
    to_encode = data.copy()
    if expires_delta:
        expire = datetime.now(timezone.utc) + expires_delta
    else:
        expire = datetime.now(timezone.utc) + timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)

    to_encode.update({"exp": expire})
    return jwt.encode(to_encode, _secret_key(), algorithm=ALGORITHM)


def verify_access_token(token: str) -> Optional[TokenPayload]:
    """Verify and decode a JWT access token."""
    try:
        payload = jwt.decode(token, _secret_key(), algorithms=[ALGORITHM])
        email: str = payload.get("sub")
        if email is None:
            return None
        return TokenPayload(sub=email)
    except InvalidTokenError:
        return None


def create_refresh_token(data: dict) -> tuple[str, str]:
    """
    Create a long-lived JWT refresh token.

    Returns:
        (token, jti) — the caller must persist the jti in ``refresh_tokens``
        so the token can be revoked before its natural expiry.
    """
    jti = secrets.token_hex(32)
    to_encode = {**data, "type": "refresh", "jti": jti}
    expire = datetime.now(timezone.utc) + timedelta(days=REFRESH_TOKEN_EXPIRE_DAYS)
    to_encode.update({"exp": expire})
    token = jwt.encode(to_encode, _secret_key(), algorithm=ALGORITHM)
    return token, jti


def verify_refresh_token(token: str) -> Optional[TokenPayload]:
    """
    Verify a refresh token's JWT signature and claims.

    Returns None if invalid, expired, or not a refresh token.
    Callers must additionally check the DB for revocation — this function
    only validates the cryptographic signature and basic claims.
    """
    if not token:
        return None
    try:
        payload = jwt.decode(token, _secret_key(), algorithms=[ALGORITHM])
        if payload.get("type") != "refresh":
            return None
        email: str = payload.get("sub")
        jti: str = payload.get("jti")
        if email is None or jti is None:
            return None
        return TokenPayload(sub=email, jti=jti)
    except InvalidTokenError:
        return None
