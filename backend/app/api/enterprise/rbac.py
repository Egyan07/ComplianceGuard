from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.api.deps import require_enterprise, require_admin
from app.models.user import User
from app.models.enterprise import UserRole
from app.services.audit_service import log_event

router = APIRouter(prefix="/enterprise", tags=["enterprise"])

VALID_ROLES = {"admin", "auditor"}


class RoleUpdate(BaseModel):
    role: str


@router.get("/users")
def list_users(
    current_user: User = Depends(require_enterprise),
    db: Session = Depends(get_db),
):
    """List all active users with their enterprise roles. Enterprise-gated."""
    users = db.query(User).filter(User.is_active == True).all()
    role_map = {r.user_id: r.role for r in db.query(UserRole).all()}
    return [
        {
            "id": u.id,
            "email": u.email,
            "first_name": u.first_name,
            "last_name": u.last_name,
            "role": role_map.get(u.id),
        }
        for u in users
    ]


@router.put("/users/{user_id}/role")
def assign_role(
    user_id: int,
    payload: RoleUpdate,
    current_user: User = Depends(require_admin),
    db: Session = Depends(get_db),
):
    """Assign admin or auditor role to a user. Admin-gated. Fires role_assigned audit event."""
    if payload.role not in VALID_ROLES:
        raise HTTPException(status_code=422, detail=f"Role must be one of: {sorted(VALID_ROLES)}")
    target = db.query(User).filter(User.id == user_id).first()
    if not target:
        raise HTTPException(status_code=404, detail="User not found")
    row = db.query(UserRole).filter(UserRole.user_id == user_id).first()
    if row:
        row.role = payload.role
    else:
        row = UserRole(user_id=user_id, role=payload.role)
        db.add(row)
    db.commit()
    log_event(db, "role_assigned", user_id=current_user.id, detail={"target_user_id": user_id, "role": payload.role})
    return {"user_id": user_id, "role": row.role}
