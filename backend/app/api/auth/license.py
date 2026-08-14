"""License auth routes: activate-license, license-info (web mode)."""

from fastapi import APIRouter, Depends, HTTPException, status, Request

from app.core.rate_limit import limiter
from app.core.license import verify_license_key
from app.models.user import User
from app.core.database import get_db
from app.api.deps import get_current_user
from sqlalchemy.orm import Session

from app.api.auth.schemas import ActivateLicenseRequest, LicenseInfoResponse

router = APIRouter()


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
