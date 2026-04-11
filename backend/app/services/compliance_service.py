"""
Compliance Evaluation Service

This service provides compliance evaluation functionality for SOC 2 controls,
including scoring, assessment, and reporting capabilities.
"""

from typing import Dict, List, Optional, Any
from dataclasses import dataclass, field
from datetime import datetime
from enum import Enum

from app.core.soc2_controls import SOC2Framework, SOC2Control, ControlStatus


class ComplianceStatus(str, Enum):
    """Compliance status enumeration."""
    NON_COMPLIANT = "non_compliant"
    PARTIALLY_COMPLIANT = "partially_compliant"
    COMPLIANT = "compliant"
    NOT_APPLICABLE = "not_applicable"
    NOT_EVALUATED = "not_evaluated"


class ComplianceLevel(str, Enum):
    """Compliance maturity level."""
    INADEQUATE = "inadequate"
    PARTIAL = "partial"
    ADEQUATE = "adequate"
    GOOD = "good"
    EXCELLENT = "excellent"


@dataclass
class ControlAssessment:
    """Individual control assessment result."""
    control_id: str
    status: ComplianceStatus
    score: float  # 0.0 to 1.0
    evidence_provided: List[str]
    evidence_required: List[str]
    gaps: List[str]
    recommendations: List[str]
    assessed_date: datetime
    assessed_by: str
    comments: Optional[str] = None


@dataclass
class ComplianceEvaluation:
    """Complete compliance evaluation result."""
    framework_id: str
    overall_score: float
    compliance_status: ComplianceStatus
    compliance_level: ComplianceLevel
    control_assessments: Dict[str, ControlAssessment]
    evaluation_date: datetime
    evaluated_by: str
    scope: List[str]  # List of control categories evaluated
    evidence_summary: Dict[str, int]  # Evidence counts by type
    risk_assessment: Dict[str, Any] = field(default_factory=dict)
    recommendations: List[str] = field(default_factory=list)
    next_review_date: Optional[datetime] = None


class ComplianceService:
    """
    Service for evaluating SOC 2 compliance and managing compliance assessments.
    """

    def __init__(self, framework: SOC2Framework):
        self.framework = framework
        self.evaluations: Dict[str, ComplianceEvaluation] = {}

    def evaluate_compliance(self,
                          evidence_data: Dict[str, Dict[str, Any]],
                          scope: Optional[List[str]] = None,
                          evaluated_by: str = "system") -> ComplianceEvaluation:
        """
        Evaluate compliance based on provided evidence data.

        Args:
            evidence_data: Dictionary mapping control IDs to evidence information
            scope: Optional list of control categories to evaluate
            evaluated_by: Identifier for who performed the evaluation

        Returns:
            ComplianceEvaluation object with results
        """
        if scope is None:
            # Evaluate all controls
            controls_to_evaluate = self.framework.get_all_controls()
        else:
            # Evaluate only controls in specified categories
            controls_to_evaluate = []
            for category in scope:
                controls_to_evaluate.extend(self.framework.get_controls_by_category(category))

        control_assessments = {}
        total_score = 0.0
        valid_controls = 0

        for control in controls_to_evaluate:
            assessment = self._assess_control(control, evidence_data.get(control.id, {}), evaluated_by)
            control_assessments[control.id] = assessment

            # Only include controls that were actually evaluated in scoring
            if assessment.status != ComplianceStatus.NOT_EVALUATED:
                total_score += assessment.score
                valid_controls += 1

        # Calculate overall score
        overall_score = total_score / valid_controls if valid_controls > 0 else 0.0

        # Determine overall compliance status
        compliance_status = self._determine_overall_status(control_assessments)
        compliance_level = self._determine_compliance_level(overall_score)

        # Generate evaluation
        evaluation = ComplianceEvaluation(
            framework_id="soc2_v2017",
            overall_score=overall_score,
            compliance_status=compliance_status,
            compliance_level=compliance_level,
            control_assessments=control_assessments,
            evaluation_date=datetime.now(),
            evaluated_by=evaluated_by,
            scope=scope or [control.category.value for control in self.framework.get_all_controls()],
            evidence_summary=self._generate_evidence_summary(control_assessments),
            risk_assessment=self._assess_risks(control_assessments),
            recommendations=self._generate_recommendations(control_assessments),
            next_review_date=self._calculate_next_review(overall_score)
        )

        # Store evaluation
        evaluation_id = f"eval_{evaluation.evaluation_date.isoformat()}"
        self.evaluations[evaluation_id] = evaluation

        return evaluation

    def _assess_control(self, control: SOC2Control, evidence_data: Dict[str, Any], assessed_by: str) -> ControlAssessment:
        """Assess a single control based on evidence."""
        if not evidence_data:
            return ControlAssessment(
                control_id=control.id,
                status=ComplianceStatus.NOT_EVALUATED,
                score=0.0,
                evidence_provided=[],
                evidence_required=[req.id for req in control.evidence_mapping],
                gaps=["No evidence provided"],
                recommendations=["Provide required evidence for assessment"],
                assessed_date=datetime.now(),
                assessed_by=assessed_by
            )

        # Extract evidence information
        provided_evidence = evidence_data.get("evidence_provided", [])
        evidence_status = evidence_data.get("status", "unknown")
        score = evidence_data.get("score", 0.0)

        # Determine status based on score
        if score >= 0.9:
            status = ComplianceStatus.COMPLIANT
        elif score >= 0.6:
            status = ComplianceStatus.PARTIALLY_COMPLIANT
        else:
            status = ComplianceStatus.NON_COMPLIANT

        # Identify gaps
        gaps = []
        for req in control.evidence_mapping:
            if req.id not in provided_evidence:
                gaps.append(f"Missing evidence: {req.name}")

        # Generate recommendations
        recommendations = []
        if gaps:
            recommendations.extend([f"Provide {gap}" for gap in gaps])
        if score < 0.9:
            recommendations.append("Improve control implementation")

        return ControlAssessment(
            control_id=control.id,
            status=status,
            score=min(max(score, 0.0), 1.0),  # Clamp to 0-1 range
            evidence_provided=provided_evidence,
            evidence_required=[req.id for req in control.evidence_mapping],
            gaps=gaps,
            recommendations=recommendations,
            assessed_date=datetime.now(),
            assessed_by=assessed_by
        )

    def _determine_overall_status(self, assessments: Dict[str, ControlAssessment]) -> ComplianceStatus:
        """Determine overall compliance status from individual assessments."""
        if not assessments:
            return ComplianceStatus.NOT_EVALUATED

        evaluated_assessments = [
            assessment for assessment in assessments.values()
            if assessment.status != ComplianceStatus.NOT_EVALUATED
        ]

        if not evaluated_assessments:
            return ComplianceStatus.NOT_EVALUATED

        compliant_count = sum(1 for a in evaluated_assessments if a.status == ComplianceStatus.COMPLIANT)
        partial_count = sum(1 for a in evaluated_assessments if a.status == ComplianceStatus.PARTIALLY_COMPLIANT)
        non_compliant_count = sum(1 for a in evaluated_assessments if a.status == ComplianceStatus.NON_COMPLIANT)

        total_evaluated = len(evaluated_assessments)
        compliant_ratio = compliant_count / total_evaluated

        if compliant_ratio >= 0.8:
            return ComplianceStatus.COMPLIANT
        elif compliant_ratio >= 0.5:
            return ComplianceStatus.PARTIALLY_COMPLIANT
        else:
            return ComplianceStatus.NON_COMPLIANT

    def _determine_compliance_level(self, overall_score: float) -> ComplianceLevel:
        """Determine compliance maturity level based on overall score."""
        if overall_score >= 0.95:
            return ComplianceLevel.EXCELLENT
        elif overall_score >= 0.85:
            return ComplianceLevel.GOOD
        elif overall_score >= 0.70:
            return ComplianceLevel.ADEQUATE
        elif overall_score >= 0.50:
            return ComplianceLevel.PARTIAL
        else:
            return ComplianceLevel.INADEQUATE

    def _generate_evidence_summary(self, assessments: Dict[str, ControlAssessment]) -> Dict[str, int]:
        """Generate summary of evidence by type."""
        summary = {
            "total_required": 0,
            "total_provided": 0,
            "by_type": {}
        }

        # Count required evidence from framework
        for control in self.framework.get_all_controls():
            for evidence_req in control.evidence_mapping:
                evidence_type = evidence_req.type
                if evidence_type not in summary["by_type"]:
                    summary["by_type"][evidence_type] = {"required": 0, "provided": 0}
                summary["by_type"][evidence_type]["required"] += 1
                summary["total_required"] += 1

        # Count provided evidence from assessments
        for assessment in assessments.values():
            summary["total_provided"] += len(assessment.evidence_provided)

        return summary

    def _assess_risks(self, assessments: Dict[str, ControlAssessment]) -> Dict[str, Any]:
        """Assess compliance risks based on assessment results."""
        risks = {
            "high_risk_controls": [],
            "control_gaps": [],
            "recommendations_priority": []
        }

        for assessment in assessments.values():
            if assessment.score < 0.6:  # High risk threshold
                risks["high_risk_controls"].append({
                    "control_id": assessment.control_id,
                    "score": assessment.score,
                    "gaps": assessment.gaps
                })

            if assessment.gaps:
                risks["control_gaps"].extend(assessment.gaps)

            # Add high-priority recommendations
            if assessment.score < 0.5:
                risks["recommendations_priority"].extend(assessment.recommendations[:2])

        return risks

    def _generate_recommendations(self, assessments: Dict[str, ControlAssessment]) -> List[str]:
        """Generate overall recommendations for improvement."""
        recommendations = []
        low_scoring_controls = []
        missing_evidence_count = 0

        for assessment in assessments.values():
            if assessment.score < 0.7:
                low_scoring_controls.append(assessment.control_id)

            missing_evidence_count += len(assessment.gaps)

        if low_scoring_controls:
            recommendations.append(f"Focus improvement efforts on controls: {', '.join(low_scoring_controls[:5])}")

        if missing_evidence_count > 0:
            recommendations.append(f"Provide {missing_evidence_count} pieces of missing evidence")

        if len(low_scoring_controls) > len(assessments) * 0.5:
            recommendations.append("Consider comprehensive control framework review")

        return recommendations

    def _calculate_next_review(self, overall_score: float) -> datetime:
        """Calculate next review date based on compliance score."""
        from datetime import timedelta

        if overall_score >= 0.9:
            # High compliance - review annually
            days = 365
        elif overall_score >= 0.7:
            # Medium compliance - review semi-annually
            days = 180
        else:
            # Low compliance - review quarterly
            days = 90

        return datetime.now() + timedelta(days=days)

    def get_evaluation_history(self) -> List[ComplianceEvaluation]:
        """Get list of all evaluations performed."""
        return list(self.evaluations.values())

    def get_evaluation_by_id(self, evaluation_id: str) -> Optional[ComplianceEvaluation]:
        """Get a specific evaluation by ID."""
        return self.evaluations.get(evaluation_id)

    def get_control_compliance_trend(self, control_id: str) -> List[Dict[str, Any]]:
        """Get compliance trend for a specific control across evaluations."""
        trend = []
        for evaluation in self.evaluations.values():
            if control_id in evaluation.control_assessments:
                assessment = evaluation.control_assessments[control_id]
                trend.append({
                    "date": assessment.assessed_date,
                    "score": assessment.score,
                    "status": assessment.status.value
                })

        # Sort by date
        trend.sort(key=lambda x: x["date"])
        return trend

    def export_evaluation_report(self, evaluation: ComplianceEvaluation) -> Dict[str, Any]:
        """Export evaluation as a comprehensive report."""
        return {
            "evaluation_metadata": {
                "id": evaluation.framework_id,
                "date": evaluation.evaluation_date.isoformat(),
                "evaluator": evaluation.evaluated_by,
                "scope": evaluation.scope
            },
            "summary": {
                "overall_score": evaluation.overall_score,
                "compliance_status": evaluation.compliance_status.value,
                "compliance_level": evaluation.compliance_level.value,
                "total_controls": len(evaluation.control_assessments),
                "compliant_controls": sum(1 for a in evaluation.control_assessments.values()
                                        if a.status == ComplianceStatus.COMPLIANT)
            },
            "control_details": {
                control_id: {
                    "status": assessment.status.value,
                    "score": assessment.score,
                    "gaps": assessment.gaps,
                    "recommendations": assessment.recommendations
                }
                for control_id, assessment in evaluation.control_assessments.items()
            },
            "risk_assessment": evaluation.risk_assessment,
            "evidence_summary": evaluation.evidence_summary,
            "recommendations": evaluation.recommendations,
            "next_review": evaluation.next_review_date.isoformat() if evaluation.next_review_date else None
        }


# Convenience functions

def create_compliance_service(framework: SOC2Framework) -> ComplianceService:
    """Create and return a new compliance service instance."""
    return ComplianceService(framework)


def calculate_compliance_score(assessments: Dict[str, ControlAssessment]) -> float:
    """Calculate overall compliance score from assessments."""
    if not assessments:
        return 0.0

    evaluated_scores = [
        assessment.score for assessment in assessments.values()
        if assessment.status != ComplianceStatus.NOT_EVALUATED
    ]

    return sum(evaluated_scores) / len(evaluated_scores) if evaluated_scores else 0.0


def get_compliance_status_from_score(score: float) -> ComplianceStatus:
    """Determine compliance status from a score value."""
    if score >= 0.9:
        return ComplianceStatus.COMPLIANT
    elif score >= 0.6:
        return ComplianceStatus.PARTIALLY_COMPLIANT
    else:
        return ComplianceStatus.NON_COMPLIANT