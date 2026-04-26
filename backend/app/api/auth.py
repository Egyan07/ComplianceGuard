"""
Authentication API endpoints for ComplianceGuard.

This module provides JWT-based authentication endpoints including login and
registration.

CSRF invariant — DO NOT SET AUTH COOKIES
----------------------------------------
Authentication state is carried exclusively via the ``Authorization: Bearer``
header. No endpoint in this module sets an auth cookie, and the frontend is
expected to store tokens in ``localStorage``, not cookies. That's what makes
the API CSRF-safe without an explicit CSRF token: a cross-site forgery
attempt cannot attach the bearer header because JS on an attacker-controlled
origin has no access to our origin's ``localStorage``.

If you ever add a cookie-based auth path here (session cookie, persistent
login, OAuth proxy, etc.), you MUST also add CSRF protection — SameSite=Lax
alone is not sufficient for state-changing endpoints.
"""

from datetime import timedelta, datetime, timezone
from typing import Annotated
import secrets
import re
import logging

from fastapi import APIRouter, Depends, HTTPException, status, Request
from fastapi.security import OAuth2PasswordRequestForm

from app.core.rate_limit import limiter
from app.core.license import verify_license_key
from pydantic import BaseModel, ConfigDict, EmailStr

from app.core.auth import (
    authenticate_user,
    create_access_token,
    create_refresh_token,
    verify_refresh_token,
    get_password_hash,
    ACCESS_TOKEN_EXPIRE_MINUTES,
    REFRESH_TOKEN_EXPIRE_DAYS,
)
from app.core.config import settings
from app.models.user import User
from app.models.refresh_token import RefreshToken
from app.core.database import get_db
from app.api.deps import get_current_user, get_current_user_unverified
from app.core.email import send_verification_email, send_password_reset_email
from sqlalchemy.orm import Session


router = APIRouter(prefix="/auth", tags=["authentication"])


def _issue_refresh_token(user_id: int, sub: str, db: Session) -> str:
    """Create a refresh token JWT and persist its jti to the DB for revocation support."""
    token, jti = create_refresh_token({"sub": sub})
    expires_at = datetime.now(timezone.utc) + timedelta(days=REFRESH_TOKEN_EXPIRE_DAYS)
    db.add(RefreshToken(jti=jti, user_id=user_id, expires_at=expires_at))
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


class UserCreate(BaseModel):
    """Schema for user registration."""
    email: EmailStr
    password: str
    first_name: str | None = None
    last_name: str | None = None


class UserResponse(BaseModel):
    """Schema for user response."""
    model_config = ConfigDict(from_attributes=True)

    id: int
    email: str
    first_name: str | None = None
    last_name: str | None = None
    is_active: bool
    is_superuser: bool


class LoginResponse(BaseModel):
    """Schema for login response."""
    access_token: str
    refresh_token: str
    token_type: str
    user: UserResponse


@router.post("/login", response_model=LoginResponse)
@limiter.limit("5/minute")
async def login(
    request: Request,
    form_data: Annotated[OAuth2PasswordRequestForm, Depends()],
    db: Session = Depends(get_db)
):
    """
    Authenticate user and return JWT token.

    Args:
        form_data: OAuth2 password request form containing username (email) and password
        db: Database session

    Returns:
        LoginResponse containing access token and user information

    Raises:
        HTTPException: If authentication fails
    """
    user = authenticate_user(db, form_data.username, form_data.password)
    if not user:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect email or password",
            headers={"WWW-Authenticate": "Bearer"},
        )

    access_token_expires = timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
    access_token = create_access_token(
        data={"sub": user.email}, expires_delta=access_token_expires
    )

    refresh_token = _issue_refresh_token(user.id, user.email, db)
    db.commit()

    return LoginResponse(
        access_token=access_token,
        refresh_token=refresh_token,
        token_type="bearer",
        user=UserResponse(
            id=user.id,
            email=user.email,
            first_name=user.first_name,
            last_name=user.last_name,
            is_active=user.is_active,
            is_superuser=user.is_superuser,
        ),
    )


@router.post("/register", response_model=LoginResponse)
@limiter.limit("3/minute")
async def register(
    request: Request,
    user_data: UserCreate,
    db: Session = Depends(get_db)
):
    """
    Register a new user and return JWT token.

    Args:
        user_data: User registration data
        db: Database session

    Returns:
        LoginResponse containing access token and user information

    Raises:
        HTTPException: If user with email already exists
    """
    errors = validate_password_strength(user_data.password)
    if errors:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Password must contain {', '.join(errors)}",
        )

    # Check if user already exists
    existing_user = db.query(User).filter(User.email == user_data.email).first()
    if existing_user:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="User with this email already exists"
        )

    # Create new user with verification token
    hashed_password = get_password_hash(user_data.password)
    verification_token = secrets.token_urlsafe(32)
    new_user = User(
        email=user_data.email,
        hashed_password=hashed_password,
        first_name=user_data.first_name,
        last_name=user_data.last_name,
        is_active=True,
        is_superuser=False,
        is_verified=False,
        verification_token=verification_token,
    )

    db.add(new_user)
    db.commit()
    db.refresh(new_user)

    # Send verification email (no-op if EMAIL_ENABLED=false)
    # SMTP failures are logged but must not break registration
    try:
        await send_verification_email(new_user.email, verification_token)
    except Exception:
        logging.getLogger(__name__).error(
            "Failed to send verification email to %s", new_user.email, exc_info=True
        )

    access_token_expires = timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
    access_token = create_access_token(
        data={"sub": new_user.email}, expires_delta=access_token_expires
    )

    refresh_token = _issue_refresh_token(new_user.id, new_user.email, db)
    db.commit()

    return LoginResponse(
        access_token=access_token,
        refresh_token=refresh_token,
        token_type="bearer",
        user=UserResponse(
            id=new_user.id,
            email=new_user.email,
            first_name=new_user.first_name,
            last_name=new_user.last_name,
            is_active=new_user.is_active,
            is_superuser=new_user.is_superuser,
        ),
    )


class VerifyEmailRequest(BaseModel):
    """Schema for email verification."""
    token: str


@router.post("/verify-email")
async def verify_email(
    request: VerifyEmailRequest,
    db: Session = Depends(get_db),
):
    """Verify a user's email address using the verification token."""
    user = db.query(User).filter(User.verification_token == request.token).first()
    if not user:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid or expired verification token",
        )

    user.is_verified = True
    user.verification_token = None
    db.commit()

    return {"message": "Email verified successfully"}


@router.get("/verification-status")
async def get_verification_status(
    current_user: User = Depends(get_current_user_unverified),
):
    """Check if the current user's email is verified."""
    return {"is_verified": current_user.is_verified}


class ForgotPasswordRequest(BaseModel):
    """Schema for forgot password."""
    email: EmailStr


class ResetPasswordRequest(BaseModel):
    """Schema for password reset."""
    token: str
    new_password: str


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

    user.hashed_password = get_password_hash(request_data.new_password)
    user.reset_token = None
    user.reset_token_expires = None
    db.commit()

    return {"message": "Password reset successfully"}


class RefreshRequest(BaseModel):
    """Schema for token refresh."""
    refresh_token: str


class RefreshResponse(BaseModel):
    """Schema for refresh token response."""
    access_token: str
    token_type: str


@router.post("/refresh", response_model=RefreshResponse)
@limiter.limit("10/minute")
async def refresh_token(
    request: Request,
    request_data: RefreshRequest,
    db: Session = Depends(get_db),
):
    """Exchange a valid refresh token for a new access token."""
    _invalid = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Invalid or expired refresh token",
        headers={"WWW-Authenticate": "Bearer"},
    )

    token_data = verify_refresh_token(request_data.refresh_token)
    if token_data is None or token_data.sub is None or token_data.jti is None:
        raise _invalid

    # Validate against DB — ensures the token hasn't been revoked via /logout.
    db_token = (
        db.query(RefreshToken).filter(RefreshToken.jti == token_data.jti).first()
    )
    if db_token is None or db_token.is_revoked or db_token.is_expired:
        raise _invalid

    user = db.query(User).filter(User.email == token_data.sub).first()
    if not user or not user.is_active:
        raise _invalid

    access_token = create_access_token(
        data={"sub": user.email},
        expires_delta=timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES),
    )
    return RefreshResponse(access_token=access_token, token_type="bearer")


@router.post("/logout")
@limiter.limit("20/minute")
async def logout(
    request: Request,
    request_data: RefreshRequest,
    db: Session = Depends(get_db),
):
    """
    Revoke the supplied refresh token.

    The access token (short-lived) cannot be revoked here — clients must
    simply discard it. The refresh token's jti is marked revoked in the DB
    so it can never be exchanged for a new access token.
    """
    token_data = verify_refresh_token(request_data.refresh_token)
    if token_data is not None and token_data.jti:
        db_token = (
            db.query(RefreshToken).filter(RefreshToken.jti == token_data.jti).first()
        )
        if db_token and not db_token.is_revoked:
            db_token.revoked_at = datetime.now(timezone.utc)
            db.commit()
    # Always return 200 — don't leak whether the token existed.
    return {"message": "Logged out successfully"}


class ActivateLicenseRequest(BaseModel):
    """Schema for license activation."""
    license_key: str


class LicenseInfoResponse(BaseModel):
    """Schema for license info response."""
    tier: str
    license_id: str | None
    email: str | None
    expires_at: str | None
    days_remaining: int | None
    is_expired: bool
    is_grace_period: bool


@router.post("/activate-license", response_model=LicenseInfoResponse)
@limiter.limit("5/minute")
async def activate_license(
    request: Request,
    request_data: ActivateLicenseRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Verify and activate a license key for the current user (web mode)."""
    result = verify_license_key(request_data.license_key)

    if not result["valid"]:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Invalid license key: {result['error']}",
        )

    payload = result["payload"]

    # Prevent activating a license registered to a different email
    license_email = payload.get("email")
    if license_email and license_email.lower() != current_user.email.lower():
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="License key is registered to a different email address.",
        )

    current_user.license_tier = result["tier"]
    current_user.license_key = request_data.license_key
    db.commit()
    db.refresh(current_user)

    return LicenseInfoResponse(
        tier=result["tier"],
        license_id=payload.get("licenseId"),
        email=payload.get("email"),
        expires_at=payload.get("expiresAt"),
        days_remaining=result.get("days_remaining"),
        is_expired=result.get("is_expired", False),
        is_grace_period=result.get("is_grace_period", False),
    )


@router.get("/license-info", response_model=LicenseInfoResponse)
async def get_license_info(
    current_user: User = Depends(get_current_user),
):
    """Return the current user's license tier and info."""
    if current_user.license_key:
        result = verify_license_key(current_user.license_key)
        if result["valid"]:
            payload = result["payload"]
            return LicenseInfoResponse(
                tier=current_user.license_tier,
                license_id=payload.get("licenseId"),
                email=payload.get("email"),
                expires_at=payload.get("expiresAt"),
                days_remaining=result.get("days_remaining"),
                is_expired=result.get("is_expired", False),
                is_grace_period=result.get("is_grace_period", False),
            )

    # No license or expired/invalid stored key — return free tier defaults
    return LicenseInfoResponse(
        tier=current_user.license_tier,
        license_id=None,
        email=current_user.email,
        expires_at=None,
        days_remaining=None,
        is_expired=False,
        is_grace_period=False,
    )
