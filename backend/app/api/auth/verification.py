"""Email verification auth routes: verify-email, verification-status, resend-verification."""

import secrets
import logging

from fastapi import APIRouter, Depends, HTTPException, status, Request

from app.core.rate_limit import limiter
from app.models.user import User
from app.core.database import get_db
from app.api.deps import get_current_user_unverified
from app.core.email import send_verification_email
from sqlalchemy.orm import Session

from app.api.auth.schemas import VerifyEmailRequest
from app.core.token_hash import hash_token, verify_stored_token

router = APIRouter()


@router.post("/verify-email")
async def verify_email(
    request: VerifyEmailRequest,
    db: Session = Depends(get_db),
):
    """Verify a user's email address using the verification token."""
    # M-2: tokens are stored hashed; legacy plaintext rows still verify via
    # the bounded fallback scan in verify_stored_token usage below.
    user = (
        db.query(User)
        .filter(User.verification_token == hash_token(request.token))
        .first()
    )
    if user is None:
        for candidate in db.query(User).filter(User.verification_token.isnot(None)).all():
            stored = candidate.verification_token or ""
            if len(stored) != 64 or any(c not in "0123456789abcdef" for c in stored):
                if verify_stored_token(request.token, stored):
                    user = candidate
                    break
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


@router.post("/resend-verification")
@limiter.limit("3/minute")
async def resend_verification(
    request: Request,
    current_user: User = Depends(get_current_user_unverified),
    db: Session = Depends(get_db),
):
    """Issue a fresh verification token and re-send the verification email."""
    if current_user.is_verified:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Email already verified",
        )
    # M-2: persist only the hash; the raw token goes to the email only.
    verification_token = secrets.token_urlsafe(32)
    current_user.verification_token = hash_token(verification_token)
    db.commit()
    try:
        await send_verification_email(current_user.email, verification_token)
    except Exception:
        logging.getLogger(__name__).error(
            "Failed to resend verification email to %s", current_user.email, exc_info=True
        )
    return {"message": "Verification email sent"}
