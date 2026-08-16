"""Session auth routes: login, register, refresh, logout, profile, account."""

from datetime import timedelta, datetime, timezone
from typing import Annotated
import asyncio
import secrets
import logging

from fastapi import APIRouter, Depends, HTTPException, status, Request, Response, Cookie
from fastapi.security import OAuth2PasswordRequestForm

from app.core.rate_limit import limiter
from app.core.login_throttle import clear_failures, is_throttled, record_failure
from app.core.auth import (
    authenticate_user,
    create_access_token,
    verify_refresh_token,
    get_password_hash,
    verify_password,
    ACCESS_TOKEN_EXPIRE_MINUTES,
)
from app.models.user import User
from app.models.refresh_token import RefreshToken
from app.core.database import get_db
from app.api.deps import get_current_user
from app.core.email import send_verification_email
from sqlalchemy.orm import Session

from app.api.auth.helpers import (
    REFRESH_COOKIE_NAME,
    _clear_refresh_cookie,
    _issue_refresh_token,
    _set_refresh_cookie,
    validate_password_strength,
)
from app.api.auth.schemas import (
    DeleteAccountRequest,
    LoginResponse,
    ProfileUpdateRequest,
    RefreshRequest,
    RefreshResponse,
    UserCreate,
    UserResponse,
)

router = APIRouter()


@router.post("/login", response_model=LoginResponse)
@limiter.limit("5/minute")
async def login(
    request: Request,
    response: Response,
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
    # Account-aware throttle (Phase 11): protects against distributed attacks
    # that spread attempts across many IPs. The response stays IDENTICAL to a
    # wrong password so no account-existence side channel is created. The
    # IP-based limiter above still runs first and is untouched.
    email_key = form_data.username.strip().lower()
    if is_throttled(email_key):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect email or password",
            headers={"WWW-Authenticate": "Bearer"},
        )

    # bcrypt verification is CPU-bound (~200ms at default cost); run it in the
    # thread pool so concurrent logins don't serialize on the event loop.
    user = await asyncio.to_thread(authenticate_user, db, form_data.username, form_data.password)
    if not user:
        record_failure(email_key)
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect email or password",
            headers={"WWW-Authenticate": "Bearer"},
        )

    clear_failures(email_key)

    access_token_expires = timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
    access_token = create_access_token(
        data={"sub": user.email}, expires_delta=access_token_expires
    )

    refresh_token = _issue_refresh_token(user.id, user.email, db)
    db.commit()

    _set_refresh_cookie(response, refresh_token)
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
    response: Response,
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
    hashed_password = await asyncio.to_thread(get_password_hash, user_data.password)
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

    _set_refresh_cookie(response, refresh_token)
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


@router.post("/refresh", response_model=RefreshResponse)
@limiter.limit("10/minute")
async def refresh_token(
    request: Request,
    response: Response,
    db: Session = Depends(get_db),
    request_data: RefreshRequest | None = None,
    refresh_cookie: str | None = Cookie(default=None, alias=REFRESH_COOKIE_NAME),
):
    """Exchange a valid refresh token for a new access token (rotation).

    The token comes from the HttpOnly cookie (web) or the JSON body (Electron).

    Rotation & reuse detection (Phase 11): every successful refresh revokes the
    presented token and issues a new one in the same family. Presenting an
    already-rotated token is treated as theft/replay: the ENTIRE family is
    revoked and reauthentication is required.
    """
    _invalid = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Invalid or expired refresh token",
        headers={"WWW-Authenticate": "Bearer"},
    )

    token = (request_data.refresh_token if request_data else None) or refresh_cookie
    if not token:
        raise _invalid

    token_data = verify_refresh_token(token)
    if token_data is None or token_data.sub is None or token_data.jti is None:
        raise _invalid

    db_token = (
        db.query(RefreshToken).filter(RefreshToken.jti == token_data.jti).first()
    )
    if db_token is None:
        raise _invalid

    # Reuse detection: a revoked token being presented again means either a
    # rotated token was replayed (theft signal) — revoke the whole family.
    if db_token.is_revoked:
        if db_token.family_id:
            now = datetime.now(timezone.utc)
            db.query(RefreshToken).filter(
                RefreshToken.family_id == db_token.family_id,
                RefreshToken.revoked_at.is_(None),
            ).update({RefreshToken.revoked_at: now}, synchronize_session=False)
            db.commit()
        raise _invalid

    if db_token.is_expired:
        raise _invalid

    user = db.query(User).filter(User.email == token_data.sub).first()
    if not user or not user.is_active:
        raise _invalid

    # Rotate: revoke the presented token, issue a fresh one in the same family.
    # Legacy rows (family_id NULL) are promoted into a brand-new family here.
    db_token.revoked_at = datetime.now(timezone.utc)
    family_id = db_token.family_id
    new_refresh_token = _issue_refresh_token(user.id, user.email, db, family_id=family_id)
    db.commit()

    _set_refresh_cookie(response, new_refresh_token)

    access_token = create_access_token(
        data={"sub": user.email},
        expires_delta=timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES),
    )
    return RefreshResponse(
        access_token=access_token,
        refresh_token=new_refresh_token,
        token_type="bearer",
    )


@router.post("/logout")
@limiter.limit("20/minute")
async def logout(
    request: Request,
    response: Response,
    db: Session = Depends(get_db),
    request_data: RefreshRequest | None = None,
    refresh_cookie: str | None = Cookie(default=None, alias=REFRESH_COOKIE_NAME),
):
    """
    Revoke the supplied refresh token (from the HttpOnly cookie or JSON body) and
    clear the cookie.

    The access token (short-lived) cannot be revoked here — clients must
    simply discard it. The refresh token's jti is marked revoked in the DB
    so it can never be exchanged for a new access token.
    """
    token = (request_data.refresh_token if request_data else None) or refresh_cookie
    token_data = verify_refresh_token(token) if token else None
    if token_data is not None and token_data.jti:
        db_token = (
            db.query(RefreshToken).filter(RefreshToken.jti == token_data.jti).first()
        )
        if db_token and not db_token.is_revoked:
            db_token.revoked_at = datetime.now(timezone.utc)
            db.commit()
    _clear_refresh_cookie(response)
    # Always return 200 — don't leak whether the token existed.
    return {"message": "Logged out successfully"}


@router.get("/me", response_model=UserResponse)
async def get_me(
    current_user: User = Depends(get_current_user),
):
    """Return the authenticated user's profile."""
    return current_user


@router.patch("/profile", response_model=UserResponse)
@limiter.limit("10/minute")
async def update_profile(
    request: Request,
    request_data: ProfileUpdateRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Update the authenticated user's first and/or last name."""
    if request_data.first_name is not None:
        current_user.first_name = request_data.first_name
    if request_data.last_name is not None:
        current_user.last_name = request_data.last_name
    db.commit()
    db.refresh(current_user)
    return current_user


@router.delete("/account")
@limiter.limit("3/minute")
async def delete_account(
    request: Request,
    request_data: DeleteAccountRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """
    Permanently delete the authenticated user's account and all associated data.

    Requires password confirmation (GDPR Article 17). Deletion order respects FK
    constraints: control assessments -> evaluations -> evidence (cascades) ->
    evidence collections -> machines -> AWS credentials -> refresh tokens -> user.
    """
    if not await asyncio.to_thread(verify_password, request_data.password, current_user.hashed_password):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Incorrect password",
        )

    from app.models.evaluation import ComplianceEvaluationRecord, ControlAssessmentRecord
    from app.models.evidence import EvidenceCollection, EvidenceItem
    from app.models.machine import Machine
    from app.models.aws_credential import AwsCredential

    user_id = current_user.id

    eval_ids = [
        row.id for row in db.query(ComplianceEvaluationRecord.id)
        .filter(ComplianceEvaluationRecord.user_id == user_id)
        .all()
    ]
    if eval_ids:
        db.query(ControlAssessmentRecord).filter(
            ControlAssessmentRecord.evaluation_id.in_(eval_ids)
        ).delete(synchronize_session=False)

    db.query(ComplianceEvaluationRecord).filter(
        ComplianceEvaluationRecord.user_id == user_id
    ).delete(synchronize_session=False)

    # Delete child evidence_items first: the FK has no ON DELETE CASCADE, so on
    # Postgres a bulk collection delete with existing items raises a
    # ForeignKeyViolation (account deletion would be impossible — GDPR erasure).
    coll_ids = [
        row.id for row in db.query(EvidenceCollection.id)
        .filter(EvidenceCollection.user_id == user_id)
        .all()
    ]
    if coll_ids:
        db.query(EvidenceItem).filter(
            EvidenceItem.collection_id.in_(coll_ids)
        ).delete(synchronize_session=False)

    db.query(EvidenceCollection).filter(
        EvidenceCollection.user_id == user_id
    ).delete(synchronize_session=False)

    db.query(Machine).filter(Machine.user_id == user_id).delete(synchronize_session=False)

    db.query(AwsCredential).filter(
        AwsCredential.user_id == user_id
    ).delete(synchronize_session=False)

    db.query(RefreshToken).filter(
        RefreshToken.user_id == user_id
    ).delete(synchronize_session=False)

    db.delete(current_user)
    db.commit()

    return {"message": "Account deleted"}
