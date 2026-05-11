"""Shared scoring helpers for framework evaluate-from-evidence endpoints."""
from typing import Any, Dict, List


def score_from_map(
    items: List[Any],
    evidence_map: Dict[str, Dict[str, float]],
) -> Dict[str, Dict[str, Any]]:
    """
    Aggregate evidence items into per-control scored dict.
    Takes the max score when the same control appears via multiple evidence types.
    """
    control_scores: Dict[str, Dict[str, Any]] = {}
    for item in items:
        for control_id, score in evidence_map.get(item.evidence_type, {}).items():
            if control_id not in control_scores:
                control_scores[control_id] = {
                    "score": score,
                    "evidence_provided": [item.evidence_type],
                    "status": "unknown",
                    "comments": "Auto-evaluated from stored evidence",
                }
            else:
                control_scores[control_id]["score"] = max(
                    control_scores[control_id]["score"], score
                )
                if item.evidence_type not in control_scores[control_id]["evidence_provided"]:
                    control_scores[control_id]["evidence_provided"].append(item.evidence_type)
    return control_scores


def derive_overall(control_scores: Dict[str, Dict[str, Any]]) -> Dict[str, Any]:
    """Compute overall score, status, level, and counts from control_scores dict."""
    if not control_scores:
        return {
            "overall_score": 0.0,
            "compliance_status": "non_compliant",
            "compliance_level": "inadequate",
            "control_count": 0,
            "compliant_controls": 0,
        }

    scores = [v["score"] for v in control_scores.values()]
    overall = sum(scores) / len(scores)
    compliant_count = sum(1 for s in scores if s >= 0.9)

    if overall >= 0.9:
        status = "compliant"
    elif overall >= 0.6:
        status = "partially_compliant"
    else:
        status = "non_compliant"

    if overall >= 0.95:
        level = "excellent"
    elif overall >= 0.85:
        level = "good"
    elif overall >= 0.70:
        level = "adequate"
    elif overall >= 0.50:
        level = "partial"
    else:
        level = "inadequate"

    return {
        "overall_score": overall,
        "compliance_status": status,
        "compliance_level": level,
        "control_count": len(scores),
        "compliant_controls": compliant_count,
    }
