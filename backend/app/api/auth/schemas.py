"""Request/response schemas for the auth package."""

from pydantic import BaseModel, ConfigDict, EmailStr


# Client classes for token delivery. Browsers get the refresh token ONLY via
# the HttpOnly cookie; the JSON body must not carry it (XSS exfiltration).
# The Electron desktop client cannot receive Set-Cookie from its fetch calls
# reliably across platforms, so it authenticates with body tokens stored in
# the OS keychain — it identifies itself with X-Client-Type: desktop.
CLIENT_TYPE_BROWSER = "browser"
CLIENT_TYPE_DESKTOP = "desktop"


def is_desktop_client(request) -> bool:
    """True when the caller identified as the Electron desktop app.

    Anything unrecognized defaults to browser — the stricter delivery mode.
    """
    return (request.headers.get("X-Client-Type") or "").strip().lower() == CLIENT_TYPE_DESKTOP


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
    """Schema for login response.

    ``refresh_token`` is present ONLY for desktop clients (stored in the OS
    keychain). Browser clients receive it exclusively via the HttpOnly cookie
    and the field is omitted from the JSON body entirely.
    """
    access_token: str
    refresh_token: str | None = None
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

    ``refresh_token`` carries the ROTATED token (Phase 11) — but only for
    desktop clients, which must persist it or their next refresh looks like
    reuse. Browser clients rotate via the Set-Cookie header and the field is
    omitted from the JSON body entirely.
    """
    access_token: str
    token_type: str
    refresh_token: str | None = None


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
