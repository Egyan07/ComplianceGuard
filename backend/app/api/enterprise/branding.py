import base64
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field, field_validator
from sqlalchemy.orm import Session
from typing import Optional

from app.core.database import get_db
from app.api.deps import require_enterprise, require_admin
from app.models.user import User
from app.models.enterprise import EnterpriseConfig
from app.services.audit_service import log_event

router = APIRouter(prefix="/enterprise", tags=["enterprise"])

ALLOWED_MIME = {"image/png", "image/jpeg"}
MAX_LOGO_BYTES = 512 * 1024  # 512 KB


class BrandingUpdate(BaseModel):
    company_name: str = Field(..., min_length=1, max_length=255)
    logo_base64: Optional[str] = None
    report_footer: Optional[str] = Field(None, max_length=2000)

    @field_validator("logo_base64")
    @classmethod
    def validate_logo_size(cls, v):
        if v is None:
            return v
        try:
            raw = base64.b64decode(v)
        except Exception:
            raise ValueError("logo_base64 is not valid base64")
        if len(raw) > MAX_LOGO_BYTES:
            raise ValueError(f"Logo exceeds 512 KB limit ({len(raw)} bytes)")
        return v


@router.get("/branding")
def get_branding(
    current_user: User = Depends(require_enterprise),
    db: Session = Depends(get_db),
):
    row = db.query(EnterpriseConfig).first()
    if not row:
        return {"company_name": None, "logo_base64": None, "report_footer": None}
    return {"company_name": row.company_name, "logo_base64": row.logo_base64, "report_footer": row.report_footer}


@router.put("/branding")
def update_branding(
    payload: BrandingUpdate,
    current_user: User = Depends(require_admin),
    db: Session = Depends(get_db),
):
    # Server-side MIME validation on raw magic bytes (imghdr removed in Python 3.13)
    if payload.logo_base64:
        raw = base64.b64decode(payload.logo_base64)
        is_png  = raw[:8] == b'\x89PNG\r\n\x1a\n'
        is_jpeg = raw[:2] == b'\xff\xd8'
        if not (is_png or is_jpeg):
            raise HTTPException(status_code=422, detail="Logo content does not match a valid PNG or JPEG image.")

    row = db.query(EnterpriseConfig).first()
    if row:
        row.company_name = payload.company_name
        row.logo_base64 = payload.logo_base64
        row.report_footer = payload.report_footer
    else:
        row = EnterpriseConfig(
            company_name=payload.company_name,
            logo_base64=payload.logo_base64,
            report_footer=payload.report_footer,
        )
        db.add(row)
    db.commit()
    db.refresh(row)
    log_event(db, "enterprise_config_updated", user_id=current_user.id, detail={"company_name": payload.company_name})
    return {"company_name": row.company_name, "logo_base64": row.logo_base64, "report_footer": row.report_footer}
