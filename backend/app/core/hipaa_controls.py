"""
HIPAA Security Rule (45 CFR Part 164, Subpart C) Framework

Controls loaded from hipaa_controls.yaml at runtime — edit the YAML to
add, remove, or adjust safeguards with no Python changes required.
"""

import os
from dataclasses import dataclass, field
from typing import Dict, List, Optional, Any

import yaml


@dataclass
class HIPAAControl:
    """A HIPAA Security Rule standard or implementation specification."""
    id: str
    title: str
    description: str
    category: str
    control_objective: str
    implementation_guidance: str
    specification_type: str = "required"
    related_controls: List[str] = field(default_factory=list)
    risk_level: str = "high"


_YAML_PATH = os.path.join(os.path.dirname(__file__), "hipaa_controls.yaml")


class HIPAAFramework:
    """HIPAA Security Rule framework — safeguards loaded from hipaa_controls.yaml."""

    def __init__(self):
        self.controls: Dict[str, HIPAAControl] = {}
        self._load_controls()

    def _load_controls(self) -> None:
        with open(_YAML_PATH, "r", encoding="utf-8") as fh:
            data = yaml.safe_load(fh)
        for entry in data.get("controls", []):
            self.controls[entry["id"]] = HIPAAControl(
                id=entry["id"],
                title=entry["title"],
                description=entry["description"],
                category=entry["category"],
                control_objective=entry["control_objective"],
                implementation_guidance=entry["implementation_guidance"],
                specification_type=entry.get("specification_type", "required"),
                related_controls=entry.get("related_controls", []),
                risk_level=entry.get("risk_level", "high"),
            )

    def get_all_controls(self) -> List[HIPAAControl]:
        return list(self.controls.values())

    def get_control(self, control_id: str) -> Optional[HIPAAControl]:
        return self.controls.get(control_id)

    def get_controls_by_category(self, category: str) -> List[HIPAAControl]:
        return [c for c in self.controls.values() if c.category == category]

    def get_control_count(self) -> int:
        return len(self.controls)

    def search_controls(self, term: str) -> List[HIPAAControl]:
        t = term.lower()
        return [
            c for c in self.controls.values()
            if t in c.title.lower() or t in c.description.lower()
            or t in c.control_objective.lower()
        ]

    def get_framework_summary(self) -> Dict[str, Any]:
        cats: Dict[str, int] = {}
        risk: Dict[str, int] = {}
        spec_types: Dict[str, int] = {}
        for c in self.controls.values():
            cats[c.category] = cats.get(c.category, 0) + 1
            risk[c.risk_level] = risk.get(c.risk_level, 0) + 1
            spec_types[c.specification_type] = spec_types.get(c.specification_type, 0) + 1
        return {
            "total_controls": len(self.controls),
            "categories": cats,
            "risk_distribution": risk,
            "specification_types": spec_types,
        }


def create_hipaa_framework() -> HIPAAFramework:
    return HIPAAFramework()
