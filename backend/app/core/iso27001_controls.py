"""
ISO/IEC 27001:2022 Control Framework

Controls loaded from iso27001_controls.yaml at runtime — edit the YAML to
add, remove, or adjust controls with no Python changes required.
"""

import os
from dataclasses import dataclass, field
from typing import Dict, List, Optional, Any

import yaml

from app.core.shared_frameworks import SHARED_FRAMEWORKS_DIR


@dataclass
class ISO27001Control:
    """An ISO/IEC 27001:2022 Annex A control definition."""
    id: str
    title: str
    description: str
    category: str          # Domain code: A.5 … A.18
    control_objective: str
    implementation_guidance: str
    related_controls: List[str] = field(default_factory=list)
    risk_level: str = "medium"


# Canonical definition (single source of truth shared with the scoring
# engines, the desktop app, and the generated catalog). Located by upward
# search (see shared_frameworks.py) so both host and Docker layouts resolve.
_YAML_PATH = os.path.join(SHARED_FRAMEWORKS_DIR, "iso27001_controls.yaml")


class ISO27001Framework:
    """ISO/IEC 27001:2022 framework — controls loaded from the canonical
    shared/frameworks/iso27001_controls.yaml (2022 Annex A). The withdrawn
    2013 definition survives as iso27001_2013_archived.yaml for rendering
    historical evaluations."""

    def __init__(self):
        self.controls: Dict[str, ISO27001Control] = {}
        self._load_controls()

    def _load_controls(self) -> None:
        with open(_YAML_PATH, "r", encoding="utf-8") as fh:
            data = yaml.safe_load(fh)
        for entry in data.get("controls", []):
            self.controls[entry["id"]] = ISO27001Control(
                id=entry["id"],
                title=entry["title"],
                description=entry["description"],
                category=entry["category"],
                control_objective=entry["control_objective"],
                implementation_guidance=entry["implementation_guidance"],
                related_controls=entry.get("related_controls", []),
                risk_level=entry.get("risk_level", "medium"),
            )

    def get_all_controls(self) -> List[ISO27001Control]:
        return list(self.controls.values())

    def get_control(self, control_id: str) -> Optional[ISO27001Control]:
        return self.controls.get(control_id)

    def get_controls_by_category(self, category: str) -> List[ISO27001Control]:
        return [c for c in self.controls.values() if c.category == category]

    def get_control_count(self) -> int:
        return len(self.controls)

    def search_controls(self, term: str) -> List[ISO27001Control]:
        t = term.lower()
        return [
            c for c in self.controls.values()
            if t in c.title.lower() or t in c.description.lower()
            or t in c.control_objective.lower()
        ]

    def get_framework_summary(self) -> Dict[str, Any]:
        cats: Dict[str, int] = {}
        risk: Dict[str, int] = {}
        for c in self.controls.values():
            cats[c.category] = cats.get(c.category, 0) + 1
            risk[c.risk_level] = risk.get(c.risk_level, 0) + 1
        return {
            "total_controls": len(self.controls),
            "categories": cats,
            "risk_distribution": risk,
        }


def create_iso27001_framework() -> ISO27001Framework:
    return ISO27001Framework()
