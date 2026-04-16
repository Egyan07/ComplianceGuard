"""
Shared API dependencies for ComplianceGuard.

Provides reusable FastAPI dependencies for authentication and database access.
"""

from fastapi import Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer
from sqlalchemy.orm import Session

from app.core.auth import verify_access_token
from app.core.database import get_db
from app.models.user import User

oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/api/auth/login")


async def get_current_user(
    token: str = Depends(oauth2_scheme),
    db: Session = Depends(get_db),
) -> User:
    """
    Validate JWT token and return the authenticated user.

    Raises:
        HTTPException 401: If the token is invalid or the user doesn't exist.
    """
    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Invalid or expired token",
        headers={"WWW-Authenticate": "Bearer"},
    )

    token_data = verify_access_token(token)
    if token_data is None or token_data.sub is None:
        raise credentials_exception

    user = db.query(User).filter(User.email == token_data.sub).first()
    if user is None:
        raise credentials_exception

    if not user.is_active:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Inactive user account",
        )

    return user


async def require_pro(current_user: User = Depends(get_current_user)) -> User:
    """
    Dependency that requires Pro or Enterprise license tier.
    Returns HTTP 402 for free-tier users attempting to access gated features.
    """
    if current_user.license_tier not in ("pro", "enterprise"):
        raise HTTPException(
            status_code=status.HTTP_402_PAYMENT_REQUIRED,
            detail="This feature requires a Pro license. Activate a license key in Settings.",
        )
    return current_user
