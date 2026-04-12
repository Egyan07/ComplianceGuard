"""
Authentication API endpoints for ComplianceGuard.

This module provides JWT-based authentication endpoints including login and registration.
"""

from datetime import timedelta
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.security import OAuth2PasswordRequestForm
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
async def login(
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
async def register(
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

    # Create new user
    hashed_password = get_password_hash(user_data.password)
    new_user = User(
        email=user_data.email,
        hashed_password=hashed_password,
        first_name=user_data.first_name,
        last_name=user_data.last_name,
        is_active=True,
        is_superuser=False
    )

    db.add(new_user)
    db.commit()
    db.refresh(new_user)

    # Create access token
    access_token_expires = timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
    access_token = create_access_token(
        data={"sub": new_user.email}, expires_delta=access_token_expires
    )

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