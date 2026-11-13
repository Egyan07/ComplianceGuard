"""
NIST CSF 2.0 API — read-only endpoints for browsing subcategories.

NIST is scored by the canonical engine (`app/core/canonical_evidence.py`) and
has no ORM-backed framework class like SOC 2, ISO 27001, HIPAA and GDPR, so
this module serves the same canonical YAML that the engine, the desktop
framework browser and the generated frontend evidence catalog all read.
"""

import os
from typing import List, Optional

import yaml
from fastapi import APIRouter
from pydantic import BaseModel

from app.core.shared_frameworks import SHARED_FRAMEWORKS_DIR

router = APIRouter(prefix="/nist", tags=["nist"])

_YAML_NAME = "nist_csf2_controls.yaml"


class NISTControlResponse(BaseModel):
    id: str
    title: str
    description: str
    category: str
    control_objective: str
    implementation_guidance: str
    risk_level: str
    assessment_mode: Optional[str] = None


def _load_controls() -> List[dict]:
    path = os.path.join(SHARED_FRAMEWORKS_DIR, _YAML_NAME)
    with open(path, encoding="utf-8") as fh:
        return (yaml.safe_load(fh) or {}).get("controls") or []


@router.get("/framework/controls", response_model=List[NISTControlResponse])
async def get_all_controls():
    """Every NIST CSF 2.0 subcategory in the canonical table."""
    return [
        {
            "id": control["id"],
            "title": control["title"],
            "description": control["description"],
            "category": control["category"],
            "control_objective": control.get("control_objective", ""),
            "implementation_guidance": control.get("implementation_guidance", ""),
            "risk_level": control.get("risk_level") or "medium",
            "assessment_mode": control.get("assessment_mode"),
        }
        for control in _load_controls()
    ]
