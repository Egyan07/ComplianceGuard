"""
Canonical evidence vocabulary + scoring engine (Phase 4 migration).

Single source of truth for evidence types and per-framework control
requirements:
  - shared/frameworks/evidence-vocabulary.json   canonical vocabulary registry
  - shared/frameworks/{framework}_controls.yaml  canonical control definitions

Scoring semantics (ratified Phase 3 spec):
  - coverage(c) = |present(c) ∩ required(c)| / |required(c)|
  - status: 0 → not_assessed; <0.5 → non_compliant; 0.5–0.99 → partial; 1.0 → compliant
  - overall = Σ coverage(c) / N over ALL controls (not_assessed included)
  - score thresholds: ≥90 compliant, ≥70 partial (0–100 scale)
  - all controls not_assessed → overall status not_assessed (CG-M2), never non_compliant

Legacy translation: web-mode evidence stored under the old Python vocabulary
(evidence_mapping.py / *_evidence_map.py keys) is translated to its canonical
type before scoring. Types with no alias can only be satisfied by manual upload.

This is the single scoring engine (Phase 5): the legacy engines
(compliance_service.py, framework_scoring.py, *_evidence_map.py) were removed
after the canonical path was validated across all consumers.
"""
from __future__ import annotations

import json
import os
from dataclasses import dataclass, field
from typing import Any, Dict, Iterable, List, Optional, Set

import yaml

# Resolve the shared framework data. In the packaged/web deployment the repo
# layout is preserved; fall back to the legacy backend YAMLs if the shared
# directory is missing so the module never hard-fails at import time.
_REPO_ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..", ".."))
_SHARED_DIR = os.path.join(_REPO_ROOT, "shared", "frameworks")

CANONICAL_TYPES_FILE = os.path.join(_SHARED_DIR, "evidence-vocabulary.json")

_FRAMEWORK_FILES = {
    "soc2": "soc2_controls.yaml",
    "iso27001": "iso27001_controls.yaml",
    "hipaa": "hipaa_controls.yaml",
    "gdpr": "gdpr_controls.yaml",
}

# Framework key -> canonical framework id (matches legacy ids for the response
# contract, e.g. "soc2_v2017").
FRAMEWORK_IDS = {
    "soc2": "soc2_v2017",
    "iso27001": "iso27001_v2013",
    "hipaa": "hipaa_security_rule",
    "gdpr": "gdpr_2016_679",
}

STATUS_COMPLIANT = "compliant"
STATUS_PARTIAL = "partial"
STATUS_NON_COMPLIANT = "non_compliant"
STATUS_NOT_ASSESSED = "not_assessed"


class CanonicalEvidenceError(Exception):
    """Raised when canonical evidence data cannot be loaded or translated."""


@dataclass
class CanonicalControl:
    id: str
    title: str
    description: str
    category: str
    required_evidence: List[str] = field(default_factory=list)
    weight: float = 1.0


@dataclass
class ControlResult:
    control_id: str
    score: float  # 0-100 (int-valued, float for safety)
    status: str
    required_evidence: List[str]
    available_evidence: List[str]
    gaps: List[str]


@dataclass
class CanonicalEvaluation:
    framework_key: str
    framework_id: str
    framework_name: str
    overall_score: float  # 0-100
    status: str
    control_results: Dict[str, ControlResult]
    counts: Dict[str, int]
    category_scores: Dict[str, Dict[str, Any]]


def _load_json(path: str) -> Dict[str, Any]:
    with open(path, "r", encoding="utf-8") as fh:
        return json.load(fh)


def _load_yaml(path: str) -> Dict[str, Any]:
    with open(path, "r", encoding="utf-8") as fh:
        return yaml.safe_load(fh)


class EvidenceVocabulary:
    """Canonical evidence vocabulary + legacy alias translation table."""

    def __init__(self, data: Optional[Dict[str, Any]] = None):
        self._data = data or _load_json(CANONICAL_TYPES_FILE)
        self.canonical_types: Set[str] = {
            t["type"] for t in self._data.get("canonical_types", [])
        }
        self._alias_to_canonical: Dict[str, str] = {}
        for entry in self._data.get("canonical_types", []):
            for alias in entry.get("legacy_aliases", []):
                # First alias wins; duplicates (iam_mfa -> both encryption_policies
                # and user_provisioning) resolve to the FIRST listed entry so the
                # translation is deterministic.
                if alias not in self._alias_to_canonical:
                    self._alias_to_canonical[alias] = entry["type"]

    def translate(self, evidence_types: Iterable[str]) -> Set[str]:
        """Map a collection of (possibly legacy) evidence types to canonical types.

        Unknown types (including manual defaults like 'manual_upload') are
        dropped — they are not scoring inputs in the canonical vocabulary.
        """
        canonical: Set[str] = set()
        for t in evidence_types:
            resolved = self.to_canonical(t)
            if resolved:
                canonical.add(resolved)
        return canonical

    def to_canonical(self, evidence_type: str) -> Optional[str]:
        """Resolve a single evidence type to its canonical form (or None)."""
        if evidence_type in self.canonical_types:
            return evidence_type
        return self._alias_to_canonical.get(evidence_type)


class CanonicalEngine:
    """Coverage-based scoring engine over the canonical framework definitions."""

    def __init__(self, vocabulary: Optional[EvidenceVocabulary] = None):
        self.vocabulary = vocabulary or EvidenceVocabulary()
        self._frameworks: Dict[str, Dict[str, Any]] = {}
        self._controls: Dict[str, Dict[str, CanonicalControl]] = {}

    def _load_framework(self, framework_key: str) -> Dict[str, Any]:
        if framework_key in self._frameworks:
            return self._frameworks[framework_key]

        filename = _FRAMEWORK_FILES.get(framework_key)
        if not filename:
            raise CanonicalEvidenceError(f"Unknown framework key: {framework_key}")

        path = os.path.join(_SHARED_DIR, filename)
        if not os.path.exists(path):
            raise CanonicalEvidenceError(
                f"Canonical framework data missing: {path}. "
                f"Run from the repository root or check shared/frameworks/."
            )

        data = _load_yaml(path)
        controls: Dict[str, CanonicalControl] = {}
        for entry in data.get("controls", []):
            controls[entry["id"]] = CanonicalControl(
                id=entry["id"],
                title=entry.get("title", ""),
                description=entry.get("description", ""),
                category=entry.get("category", ""),
                required_evidence=list(entry.get("required_evidence", [])),
                weight=float(entry.get("weight", 1.0) or 1.0),
            )

        self._frameworks[framework_key] = data
        self._controls[framework_key] = controls
        return data

    def get_framework_name(self, framework_key: str) -> str:
        data = self._load_framework(framework_key)
        return data.get("framework", {}).get("name", framework_key)

    def evaluate(self, framework_key: str, evidence_types: Iterable[str]) -> CanonicalEvaluation:
        """Score a framework against a set of evidence types (canonical or legacy).

        Args:
            framework_key: 'soc2' | 'iso27001' | 'hipaa' | 'gdpr'
            evidence_types: evidence_type strings (canonical vocabulary or
                legacy aliases, which are translated).

        Returns:
            CanonicalEvaluation with 0-100 scores and canonical status strings.
        """
        data = self._load_framework(framework_key)
        controls = self._controls[framework_key]
        present = self.vocabulary.translate(evidence_types)

        control_results: Dict[str, ControlResult] = {}
        category_totals: Dict[str, List[float]] = {}

        for control_id, control in controls.items():
            available = sorted(present & set(control.required_evidence))
            gaps = sorted(set(control.required_evidence) - present)
            required_count = len(control.required_evidence)
            coverage = (len(available) / required_count) if required_count else 0.0

            if len(available) == 0:
                status = STATUS_NOT_ASSESSED
            elif coverage >= 1.0:
                status = STATUS_COMPLIANT
            elif coverage >= 0.5:
                status = STATUS_PARTIAL
            else:
                status = STATUS_NON_COMPLIANT

            score = round(coverage * 100)

            control_results[control_id] = ControlResult(
                control_id=control_id,
                score=score,
                status=status,
                required_evidence=sorted(control.required_evidence),
                available_evidence=available,
                gaps=gaps,
            )

            category_totals.setdefault(control.category, []).append(score)

        counts = {
            STATUS_COMPLIANT: 0,
            STATUS_PARTIAL: 0,
            STATUS_NON_COMPLIANT: 0,
            STATUS_NOT_ASSESSED: 0,
        }
        for result in control_results.values():
            counts[result.status] += 1

        category_scores: Dict[str, Dict[str, Any]] = {}
        for category, scores in category_totals.items():
            category_scores[category] = {
                "score": round(sum(scores) / len(scores), 2),
                "weight": float(len(scores)),
                "control_count": len(scores),
            }

        total = len(control_results)
        overall = (sum(r.score for r in control_results.values()) / total) if total else 0.0

        # CG-M2: with every control not_assessed there is nothing to be
        # non-compliant about — the overall status must say "not assessed",
        # not "non compliant". This is a status-label fix only: the numeric
        # average (0) is unchanged and all other thresholds are untouched.
        if all(r.status == STATUS_NOT_ASSESSED for r in control_results.values()):
            status = STATUS_NOT_ASSESSED
        elif overall >= 90:
            status = STATUS_COMPLIANT
        elif overall >= 70:
            status = STATUS_PARTIAL
        else:
            status = STATUS_NON_COMPLIANT

        framework_meta = data.get("framework", {})
        return CanonicalEvaluation(
            framework_key=framework_key,
            framework_id=framework_meta.get("id", FRAMEWORK_IDS[framework_key]),
            framework_name=framework_meta.get("name", framework_key),
            overall_score=overall,
            status=status,
            control_results=control_results,
            counts=counts,
            category_scores=category_scores,
        )


# Convenience singletons (read-only; safe to share across workers).
_vocabulary = None
_engine = None


def get_vocabulary() -> EvidenceVocabulary:
    global _vocabulary
    if _vocabulary is None:
        _vocabulary = EvidenceVocabulary()
    return _vocabulary


def get_canonical_engine() -> CanonicalEngine:
    global _engine
    if _engine is None:
        _engine = CanonicalEngine(get_vocabulary())
    return _engine
