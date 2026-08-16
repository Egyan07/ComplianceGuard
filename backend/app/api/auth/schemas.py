"""Request/response schemas for the auth package."""

from pydantic import BaseModel, ConfigDict, EmailStr


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


class VerifyEmailRequest(BaseModel):
    """Schema for email verification."""
    token: str


class ForgotPasswordRequest(BaseModel):
    """Schema for forgot password."""
    email: EmailStr


class ResetPasswordRequest(BaseModel):
    """Schema for password reset."""
    token: str
    new_password: str


class RefreshRequest(BaseModel):
    """Schema for token refresh. Optional: web clients send the refresh token via
    the HttpOnly cookie instead of the body."""
    refresh_token: str | None = None


class RefreshResponse(BaseModel):
    """Schema for refresh token response.

    ``refresh_token`` carries the ROTATED token (Phase 11): refresh rotates the
    presented token, so body-based clients (the Electron desktop) must store
    this new value or their next refresh will be treated as reuse.
    """
    access_token: str
    token_type: str
    refresh_token: str


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


class ProfileUpdateRequest(BaseModel):
    """Schema for profile update. Only provided fields are written."""
    first_name: str | None = None
    last_name: str | None = None


class DeleteAccountRequest(BaseModel):
    """Password confirmation required to prevent accidental deletion."""
    password: str
