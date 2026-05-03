"""
HIPAA Security Rule Framework API — read-only endpoints for browsing safeguards.
Mirrors iso27001.py but uses HIPAAFramework and HIPAAControl.
"""

from datetime import datetime, timezone
from typing import Dict, List

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel

from app.core.hipaa_controls import HIPAAControl, HIPAAFramework, create_hipaa_framework

router = APIRouter(prefix="/hipaa", tags=["hipaa"])

_VALID_SECTIONS = ["164.308", "164.310", "164.312", "164.314", "164.316"]

_hipaa_framework = create_hipaa_framework()


def get_hipaa_framework() -> HIPAAFramework:
    return _hipaa_framework


class HIPAAControlResponse(BaseModel):
    id: str
    title: str
    description: str
    category: str
    control_objective: str
    implementation_guidance: str
    specification_type: str
    related_controls: List[str]
    risk_level: str


class HIPAAFrameworkSummaryResponse(BaseModel):
    total_controls: int
    categories: Dict[str, int]
    risk_distribution: Dict[str, int]
    specification_types: Dict[str, int]


def _to_response(c: HIPAAControl) -> HIPAAControlResponse:
    return HIPAAControlResponse(
        id=c.id,
        title=c.title,
        description=c.description,
        category=c.category,
        control_objective=c.control_objective,
        implementation_guidance=c.implementation_guidance,
        specification_type=c.specification_type,
        related_controls=c.related_controls,
        risk_level=c.risk_level,
    )


@router.get("/framework/summary", response_model=HIPAAFrameworkSummaryResponse)
async def get_summary(fw: HIPAAFramework = Depends(get_hipaa_framework)):
    return fw.get_framework_summary()


@router.get("/framework/controls", response_model=List[HIPAAControlResponse])
async def get_all_controls(fw: HIPAAFramework = Depends(get_hipaa_framework)):
    return [_to_response(c) for c in fw.get_all_controls()]


@router.get("/framework/controls/search", response_model=List[HIPAAControlResponse])
async def search_controls(
    q: str = Query(..., min_length=2),
    fw: HIPAAFramework = Depends(get_hipaa_framework),
):
    return [_to_response(c) for c in fw.search_controls(q)]


@router.get("/framework/controls/by-category/{category}", response_model=List[HIPAAControlResponse])
async def get_by_category(
    category: str,
    fw: HIPAAFramework = Depends(get_hipaa_framework),
):
    if category not in _VALID_SECTIONS:
        raise HTTPException(
            status_code=400,
            detail=f"Invalid section. Must be one of: {', '.join(_VALID_SECTIONS)}",
        )
    return [_to_response(c) for c in fw.get_controls_by_category(category)]


@router.get("/framework/controls/{control_id:path}", response_model=HIPAAControlResponse)
async def get_control(
    control_id: str,
    fw: HIPAAFramework = Depends(get_hipaa_framework),
):
    ctrl = fw.get_control(control_id)
    if not ctrl:
        raise HTTPException(status_code=404, detail=f"Control {control_id} not found")
    return _to_response(ctrl)


@router.get("/health")
async def health(fw: HIPAAFramework = Depends(get_hipaa_framework)):
    return {
        "status": "healthy",
        "service": "hipaa-api",
        "framework_controls": fw.get_control_count(),
        "timestamp": datetime.now(timezone.utc).isoformat(),
    }
