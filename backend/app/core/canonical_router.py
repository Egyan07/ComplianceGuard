"""
Shared adapter between the canonical scoring engine and the framework routers.

Single conversion path for all four evaluate-from-evidence endpoints. The
response contract is the canonical one: overall_score 0-100 and the canonical
status vocabulary (compliant / partial / non_compliant / not_assessed).
"""
from __future__ import annotations

from typing import Any, Dict, List

from app.core.canonical_evidence import CanonicalEvaluation, get_canonical_engine

# Canonical status vocabulary, used verbatim in the response contract
# (Phase 5: not_assessed / non_compliant / partial / compliant, end-to-end).
# The frontend and report generator consume these four strings directly.
_STATUS_VOCABULARY = ("compliant", "partial", "non_compliant", "not_assessed")

# Compliance maturity level thresholds on the 0-100 canonical scale.
def compliance_level(overall_100: float) -> str:
    if overall_100 >= 95:
        return "excellent"
    if overall_100 >= 85:
        return "good"
    if overall_100 >= 70:
        return "adequate"
    if overall_100 >= 50:
        return "partial"
    return "inadequate"


def evaluate_from_evidence_canonical(
    framework_key: str,
    evidence_types: List[str],
) -> Dict[str, Any]:
    """Run the canonical engine and return the canonical response dict."""
    engine = get_canonical_engine()
    result: CanonicalEvaluation = engine.evaluate(framework_key, evidence_types)

    overall_100 = round(result.overall_score, 4)

    return {
        "engine": "canonical_v1",
        "framework_id": result.framework_id,
        "framework_name": result.framework_name,
        "overall_score": overall_100,  # canonical contract: 0-100 (matches the desktop engine and UI)
        "compliance_status": result.status if result.status in _STATUS_VOCABULARY else "non_compliant",
        "compliance_level": compliance_level(overall_100),
        "control_count": len(result.control_results),
        "compliant_controls": result.counts["compliant"],
        "partial_controls": result.counts["partial"],
        "non_compliant_controls": result.counts["non_compliant"],
        "not_assessed_controls": result.counts["not_assessed"],
        "evidence_summary": {
            "total_evidence_types": len(set(evidence_types)),
            "canonical_types_present": sorted(
                {
                    t
                    for c in result.control_results.values()
                    for t in c.available_evidence
                }
            ),
        },
        "risk_assessment": {},
        "recommendations": _recommendations(result),
        "category_scores": result.category_scores,
        "control_results": {
            cid: {
                "control_id": c.control_id,
                "score": c.score,
                "status": c.status,
                "required_evidence": c.required_evidence,
                "available_evidence": c.available_evidence,
                "gaps": c.gaps,
            }
            for cid, c in result.control_results.items()
        },
    }


def _recommendations(result: CanonicalEvaluation) -> List[str]:
    """Generate overall recommendations from the canonical evaluation."""
    recs: List[str] = []
    non_assessed = result.counts.get("not_assessed", 0)
    if non_assessed:
        recs.append(f"{non_assessed} controls have no evidence — collect evidence to assess them.")
    partial = result.counts.get("partial", 0)
    if partial:
        recs.append(f"{partial} controls are partially evidenced — complete their required evidence.")
    return recs


