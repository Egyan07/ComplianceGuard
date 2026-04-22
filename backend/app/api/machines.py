"""
Machines API for ComplianceGuard Cloud Dashboard.

Endpoints for Electron desktop apps to sync compliance snapshots
and for the web dashboard to view fleet status.
"""

from fastapi import APIRouter, HTTPException, Depends, Query, status, Request
from sqlalchemy import case, func
from sqlalchemy.orm import Session
from typing import List, Optional
from pydantic import BaseModel, Field
from datetime import datetime, timezone

from app.core.constants import MACHINE_LIMITS, VALID_COMPLIANCE_LEVELS
from app.core.database import get_db
from app.api.deps import get_current_user, require_pro
from app.core.rate_limit import limiter
from app.models.user import User
from app.models.machine import Machine

router = APIRouter(prefix="/api/v1/machines", tags=["machines"])


class MachineSyncRequest(BaseModel):
    hostname: str = Field(..., min_length=1, max_length=255)
    os_version: Optional[str] = Field(None, max_length=255)
    overall_score: Optional[float] = Field(None, ge=0.0, le=100.0)
    compliance_level: Optional[str] = Field(None)
    evidence_count: Optional[int] = Field(None, ge=0)
    agent_version: Optional[str] = Field(None, max_length=50)


class MachineSyncResponse(BaseModel):
    machine_id: int
    hostname: str
    synced_at: datetime


class MachineResponse(BaseModel):
    id: int
    hostname: str
    os_version: Optional[str]
    last_score: Optional[float]
    compliance_level: Optional[str]
    evidence_count: Optional[int]
    last_sync_at: Optional[datetime]
    is_active: bool
    created_at: datetime


class FleetStatsResponse(BaseModel):
    total_machines: int
    compliant: int
    at_risk: int
    critical: int
    never_synced: int
    avg_score: Optional[float]
    machine_limit: Optional[int]


@router.post("/sync", response_model=MachineSyncResponse)
@limiter.limit("30/minute")
async def sync_machine(
    request: Request,
    body: MachineSyncRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """
    Register or update a machine compliance snapshot.
    Called by the Electron 'Sync to Cloud' button.
    Enforces per-tier machine limits on new machines.
    Rate limited to 30 syncs/minute per IP.
    """
    if body.compliance_level is not None and body.compliance_level not in VALID_COMPLIANCE_LEVELS:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=f"Invalid compliance_level. Must be one of: {', '.join(sorted(VALID_COMPLIANCE_LEVELS))}",
        )

    limit = MACHINE_LIMITS.get(current_user.license_tier)

    existing_machine = (
        db.query(Machine)
        .filter(Machine.user_id == current_user.id, Machine.hostname == body.hostname)
        .first()
    )

    if existing_machine is None:
        if limit is not None:
            current_count = (
                db.query(Machine)
                .filter(Machine.user_id == current_user.id, Machine.is_active == True)
                .count()
            )
            if current_count >= limit:
                raise HTTPException(
                    status_code=status.HTTP_402_PAYMENT_REQUIRED,
                    detail=f"Machine limit reached ({limit} for {current_user.license_tier} tier). Upgrade to add more machines.",
                )
        machine = Machine(user_id=current_user.id, hostname=body.hostname)
        db.add(machine)
    else:
        machine = existing_machine

    machine.os_version = body.os_version
    machine.last_score = body.overall_score
    machine.compliance_level = body.compliance_level
    machine.evidence_count = body.evidence_count
    machine.agent_version = body.agent_version
    machine.last_sync_at = datetime.now(timezone.utc)
    machine.is_active = True

    db.commit()
    db.refresh(machine)

    return MachineSyncResponse(
        machine_id=machine.id,
        hostname=machine.hostname,
        synced_at=machine.last_sync_at,
    )


@router.get("/fleet-stats", response_model=FleetStatsResponse)
async def get_fleet_stats(
    current_user: User = Depends(require_pro),
    db: Session = Depends(get_db),
):
    """
    Fleet overview stats for the cloud dashboard. Requires Pro or Enterprise.

    Computes every counter in a single SQL aggregation instead of loading the
    full machines table into Python. This used to be O(n) in memory and on
    the wire; it's now O(1) regardless of fleet size.
    """
    row = (
        db.query(
            func.count(Machine.id).label("total"),
            func.coalesce(
                func.sum(case((Machine.compliance_level == "compliant", 1), else_=0)),
                0,
            ).label("compliant"),
            func.coalesce(
                func.sum(case((Machine.compliance_level == "at_risk", 1), else_=0)),
                0,
            ).label("at_risk"),
            func.coalesce(
                func.sum(case((Machine.compliance_level == "critical", 1), else_=0)),
                0,
            ).label("critical"),
            func.coalesce(
                func.sum(case((Machine.last_sync_at.is_(None), 1), else_=0)),
                0,
            ).label("never_synced"),
            func.avg(Machine.last_score).label("avg_score"),
        )
        .filter(Machine.user_id == current_user.id, Machine.is_active == True)  # noqa: E712
        .one()
    )

    avg_score = round(float(row.avg_score), 1) if row.avg_score is not None else None
    limit = MACHINE_LIMITS.get(current_user.license_tier)

    return FleetStatsResponse(
        total_machines=int(row.total or 0),
        compliant=int(row.compliant or 0),
        at_risk=int(row.at_risk or 0),
        critical=int(row.critical or 0),
        never_synced=int(row.never_synced or 0),
        avg_score=avg_score,
        machine_limit=limit,
    )


@router.get("", response_model=List[MachineResponse])
async def get_machines(
    current_user: User = Depends(require_pro),
    db: Session = Depends(get_db),
    limit: int = Query(50, ge=1, le=200, description="Max machines to return (default 50)"),
    offset: int = Query(0, ge=0, description="Skip this many machines before returning"),
):
    """
    List machines for the current user with pagination. Requires Pro/Enterprise.

    Pagination caps per-request memory and response size; large fleets no
    longer require a single unbounded result set.
    """
    machines = (
        db.query(Machine)
        .filter(Machine.user_id == current_user.id, Machine.is_active == True)  # noqa: E712
        .order_by(Machine.last_sync_at.desc().nullslast(), Machine.id.desc())
        .offset(offset)
        .limit(limit)
        .all()
    )
    return [
        MachineResponse(
            id=m.id,
            hostname=m.hostname,
            os_version=m.os_version,
            last_score=m.last_score,
            compliance_level=m.compliance_level,
            evidence_count=m.evidence_count,
            last_sync_at=m.last_sync_at,
            is_active=m.is_active,
            created_at=m.created_at,
        )
        for m in machines
    ]
