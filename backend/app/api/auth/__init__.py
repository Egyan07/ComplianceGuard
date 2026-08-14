"""
Authentication API endpoints for ComplianceGuard.

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

This package is split by concern:
  - helpers.py   cookie/token/password helpers
  - schemas.py   request/response models
  - session.py   login, register, refresh, logout, profile, account
  - verification.py  email verification
  - password.py  forgot/reset password
  - license.py   license activation + info
"""

from fastapi import APIRouter

from app.api.auth.helpers import validate_password_strength  # noqa: F401 (re-exported for tests / backwards compat)
from app.api.auth.license import router as license_router
from app.api.auth.password import router as password_router
from app.api.auth.session import router as session_router
from app.api.auth.verification import router as verification_router

router = APIRouter(prefix="/auth", tags=["authentication"])
router.include_router(session_router)
router.include_router(verification_router)
router.include_router(password_router)
router.include_router(license_router)

__all__ = ["router", "validate_password_strength"]
