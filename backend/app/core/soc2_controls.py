"""
SOC 2 Control Framework Implementation

Controls are loaded from soc2_controls.yaml at runtime so that adding,
removing, or adjusting a control requires only a YAML edit — no Python change.
The public API (SOC2Framework, SOC2Control, etc.) is unchanged.
"""

import os
from typing import Dict, List, Optional, Any
from dataclasses import dataclass, field
from enum import Enum

import yaml


class ControlCategory(str, Enum):
    """SOC 2 Trust Service Criteria categories."""
    COMMON_CRITERIA = "CC"
    AVAILABILITY = "A"
    CONFIDENTIALITY = "C"
    PROCESSING_INTEGRITY = "PI"
    CONFIDENTIALITY_AVAILABILITY = "CA"


class ControlStatus(str, Enum):
    """Control implementation status."""
    NOT_IMPLEMENTED = "not_implemented"
    PARTIALLY_IMPLEMENTED = "partially_implemented"
    FULLY_IMPLEMENTED = "fully_implemented"
    NOT_APPLICABLE = "not_applicable"


@dataclass
class EvidenceRequirement:
    """Evidence requirement for a SOC 2 control."""
    id: str
    name: str
    description: str
    type: str  # document, system, interview, observation
    frequency: str  # continuous, periodic, annual, event_driven
    retention_period: str


@dataclass
class SOC2Control:
    """SOC 2 control definition with evidence mapping."""
    id: str
    title: str
    description: str
    category: ControlCategory
    control_objective: str
    implementation_guidance: str
    evidence_mapping: List[EvidenceRequirement] = field(default_factory=list)
    related_controls: List[str] = field(default_factory=list)
    risk_level: str = "medium"  # low, medium, high


_YAML_PATH = os.path.join(os.path.dirname(__file__), "soc2_controls.yaml")

_CATEGORY_MAP = {
    "CC": ControlCategory.COMMON_CRITERIA,
    "A": ControlCategory.AVAILABILITY,
    "C": ControlCategory.CONFIDENTIALITY,
    "PI": ControlCategory.PROCESSING_INTEGRITY,
    "CA": ControlCategory.CONFIDENTIALITY_AVAILABILITY,
}


class SOC2Framework:
    """SOC 2 Control Framework — controls loaded from soc2_controls.yaml."""

    def __init__(self):
        self.controls: Dict[str, SOC2Control] = {}
        self._load_controls()

    def _load_controls(self) -> None:
        """Parse soc2_controls.yaml and populate self.controls."""
        with open(_YAML_PATH, "r", encoding="utf-8") as fh:
            data = yaml.safe_load(fh)
        for entry in data.get("controls", []):
            evidence_mapping = [
                EvidenceRequirement(
                    id=e["id"],
                    name=e["name"],
                    description=e["description"],
                    type=e["type"],
                    frequency=e["frequency"],
                    retention_period=e["retention_period"],
                )
                for e in entry.get("evidence_mapping", [])
            ]
            control = SOC2Control(
                id=entry["id"],
                title=entry["title"],
                description=entry["description"],
                category=_CATEGORY_MAP[entry["category"]],
                control_objective=entry["control_objective"],
                implementation_guidance=entry["implementation_guidance"],
                evidence_mapping=evidence_mapping,
                related_controls=entry.get("related_controls", []),
                risk_level=entry.get("risk_level", "medium"),
            )
            self.controls[control.id] = control

    def get_all_controls(self) -> List[SOC2Control]:
        """Get all SOC 2 controls."""
        return list(self.controls.values())

    def get_control(self, control_id: str) -> Optional[SOC2Control]:
        """Get a specific control by ID."""
        return self.controls.get(control_id)

    def get_controls_by_category(self, category: str) -> List[SOC2Control]:
        """Get all controls for a specific category."""
        return [control for control in self.controls.values()
                if control.category.value == category or control.category == category]

    def get_control_count(self) -> int:
        """Get total number of controls."""
        return len(self.controls)

    def search_controls(self, search_term: str) -> List[SOC2Control]:
        """Search controls by title or description."""
        search_term = search_term.lower()
        return [control for control in self.controls.values()
                if search_term in control.title.lower() or
                   search_term in control.description.lower() or
                   search_term in control.control_objective.lower()]

    def get_controls_by_risk_level(self, risk_level: str) -> List[SOC2Control]:
        """Get controls filtered by risk level."""
        return [control for control in self.controls.values()
                if control.risk_level == risk_level]

    def add_custom_control(self, control: SOC2Control) -> None:
        """Add a custom control to the framework."""
        self.controls[control.id] = control

    def remove_control(self, control_id: str) -> bool:
        """Remove a control from the framework."""
        if control_id in self.controls:
            del self.controls[control_id]
            return True
        return False

    def get_framework_summary(self) -> Dict[str, Any]:
        """Get a summary of the framework structure."""
        categories = {}
        for control in self.controls.values():
            category = control.category.value
            if category not in categories:
                categories[category] = 0
            categories[category] += 1

        return {
            "total_controls": len(self.controls),
            "categories": categories,
            "risk_distribution": self._get_risk_distribution()
        }

    def _get_risk_distribution(self) -> Dict[str, int]:
        """Get distribution of controls by risk level."""
        risk_dist = {}
        for control in self.controls.values():
            risk_level = control.risk_level
            if risk_level not in risk_dist:
                risk_dist[risk_level] = 0
            risk_dist[risk_level] += 1
        return risk_dist


# Convenience functions for easy access

def create_soc2_framework() -> SOC2Framework:
    """Create and return a new SOC 2 framework instance."""
    return SOC2Framework()


def get_available_categories() -> List[str]:
    """Get list of available SOC 2 categories."""
    return [category.value for category in ControlCategory]


def validate_control_id(control_id: str) -> bool:
    """Validate if a control ID follows SOC 2 format."""
    valid_prefixes = ["CC", "A", "C", "PI", "CA"]
    return any(control_id.startswith(prefix) for prefix in valid_prefixes)
