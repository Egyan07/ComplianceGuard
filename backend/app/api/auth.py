"""
Authentication API endpoints for ComplianceGuard.

This module provides JWT-based authentication endpoints including login and registration.
"""

from datetime import timedelta
from typing import Annotated
import secrets

from fastapi import APIRouter, Depends, HTTPException, status, Request
from fastapi.security import OAuth2PasswordRequestForm

from app.core.rate_limit import limiter
from pydantic import BaseModel, EmailStr

import re

from app.core.auth import (
    authenticate_user,
    create_access_token,
    get_password_hash,
    Token,
    ACCESS_TOKEN_EXPIRE_MINUTES
)
from app.core.config import settings
from app.models.user import User
from app.core.database import get_db
from app.api.deps import get_current_user
from sqlalchemy.orm import Session


router = APIRouter(prefix="/api/auth", tags=["authentication"])


class UserCreate(BaseModel):
    """Schema for user registration."""
    email: EmailStr
    password: str
    first_name: str | None = None
    last_name: str | None = None


class UserResponse(BaseModel):
    """Schema for user response."""
    id: int
    email: str
    first_name: str | None = None
    last_name: str | None = None
    is_active: bool
    is_superuser: bool

    class Config:
        from_attributes = True


class LoginRequest(BaseModel):
    """Schema for login request."""
    email: EmailStr
    password: str


class LoginResponse(BaseModel):
    """Schema for login response."""
    access_token: str
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

    return LoginResponse(
        access_token=access_token,
        token_type="bearer",
        user=UserResponse(
            id=user.id,
            email=user.email,
            first_name=user.first_name,
            last_name=user.last_name,
            is_active=user.is_active,
            is_superuser=user.is_superuser
        )
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
    # Validate password strength
    pwd = user_data.password
    errors = []
    if len(pwd) < settings.password_min_length:
        errors.append(f"at least {settings.password_min_length} characters")
    if settings.password_require_uppercase and not re.search(r"[A-Z]", pwd):
        errors.append("an uppercase letter")
    if settings.password_require_lowercase and not re.search(r"[a-z]", pwd):
        errors.append("a lowercase letter")
    if settings.password_require_digits and not re.search(r"\d", pwd):
        errors.append("a digit")
    if settings.password_require_special and not re.search(r"[^A-Za-z0-9]", pwd):
        errors.append("a special character")
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

    # Create access token
    access_token_expires = timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
    access_token = create_access_token(
        data={"sub": new_user.email}, expires_delta=access_token_expires
    )

    # In production, send verification_token via email instead of returning it
    return LoginResponse(
        access_token=access_token,
        token_type="bearer",
        user=UserResponse(
            id=new_user.id,
            email=new_user.email,
            first_name=new_user.first_name,
            last_name=new_user.last_name,
            is_active=new_user.is_active,
            is_superuser=new_user.is_superuser
        )
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
    current_user: User = Depends(get_current_user),
):
    """Check if the current user's email is verified."""
    return {"is_verified": current_user.is_verified}