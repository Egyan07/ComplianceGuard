"""
GDPR (EU) 2016/679 Framework

Controls loaded from gdpr_controls.yaml at runtime — edit the YAML to
add, remove, or adjust controls with no Python changes required.
"""

import os
from dataclasses import dataclass, field
from typing import Any, Dict, List, Optional

import yaml


@dataclass
class GDPRControl:
    """A GDPR (EU) 2016/679 obligation definition."""
    id: str
    title: str
    description: str
    category: str          # Article number the obligation stems from: "5" … "47"
    chapter: str           # Human-readable GDPR chapter grouping
    control_objective: str
    implementation_guidance: str
    related_controls: List[str] = field(default_factory=list)
    risk_level: str = "medium"


_YAML_PATH = os.path.join(os.path.dirname(__file__), "gdpr_controls.yaml")


class GDPRFramework:
    """GDPR framework — controls loaded from gdpr_controls.yaml."""

    def __init__(self):
        self.controls: Dict[str, GDPRControl] = {}
        self._load_controls()

    def _load_controls(self) -> None:
        with open(_YAML_PATH, "r", encoding="utf-8") as fh:
            data = yaml.safe_load(fh)
        for entry in data.get("controls", []):
            self.controls[entry["id"]] = GDPRControl(
                id=entry["id"],
                title=entry["title"],
                description=entry["description"],
                category=entry["category"],
                chapter=entry.get("chapter", "General"),
                control_objective=entry["control_objective"],
                implementation_guidance=entry["implementation_guidance"],
                related_controls=entry.get("related_controls", []),
                risk_level=entry.get("risk_level", "medium"),
            )

    def get_all_controls(self) -> List[GDPRControl]:
        return list(self.controls.values())

    def get_control(self, control_id: str) -> Optional[GDPRControl]:
        return self.controls.get(control_id)

    def get_controls_by_category(self, category: str) -> List[GDPRControl]:
        return [c for c in self.controls.values() if c.category == category]

    def get_controls_by_chapter(self, chapter: str) -> List[GDPRControl]:
        return [c for c in self.controls.values() if c.chapter == chapter]

    def get_control_count(self) -> int:
        return len(self.controls)

    def search_controls(self, term: str) -> List[GDPRControl]:
        t = term.lower()
        return [
            c for c in self.controls.values()
            if t in c.title.lower() or t in c.description.lower()
            or t in c.control_objective.lower()
            or t in c.chapter.lower()
        ]

    def get_framework_summary(self) -> Dict[str, Any]:
        cats: Dict[str, int] = {}
        chapters: Dict[str, int] = {}
        risk: Dict[str, int] = {}
        for c in self.controls.values():
            cats[c.category] = cats.get(c.category, 0) + 1
            chapters[c.chapter] = chapters.get(c.chapter, 0) + 1
            risk[c.risk_level] = risk.get(c.risk_level, 0) + 1
        return {
            "total_controls": len(self.controls),
            "categories": cats,
            "chapters": chapters,
            "risk_distribution": risk,
        }


def create_gdpr_framework() -> GDPRFramework:
    return GDPRFramework()
