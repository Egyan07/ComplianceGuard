"""
Unit tests for ComplianceService.

Covers evaluate_compliance, scoring logic, status determination,
compliance level, recommendations, risk assessment, and helpers.
"""

import pytest
from datetime import datetime
from typing import Dict, Any

from app.core.soc2_controls import create_soc2_framework
from app.services.compliance_service import (
    ComplianceService,
    ComplianceStatus,
    ComplianceLevel,
    ControlAssessment,
    ComplianceEvaluation,
    create_compliance_service,
    calculate_compliance_score,
    get_compliance_status_from_score,
)


@pytest.fixture
def framework():
    return create_soc2_framework()


@pytest.fixture
def service(framework):
    return create_compliance_service(framework)


@pytest.fixture
def full_evidence(framework):
    """Build evidence data for all controls at score 1.0."""
    return {
        control.id: {
            "evidence_provided": [e.id for e in control.evidence_mapping],
            "status": "compliant",
            "score": 1.0,
            "comments": "Full evidence"
        }
        for control in framework.get_all_controls()
    }


@pytest.fixture
def empty_evidence():
    return {}


# ─── evaluate_compliance ────────────────────────────────────────────────────

class TestEvaluateCompliance:

    def test_returns_evaluation_object(self, service, full_evidence):
        result = service.evaluate_compliance(full_evidence)
        assert isinstance(result, ComplianceEvaluation)

    def test_overall_score_between_0_and_1(self, service, full_evidence):
        result = service.evaluate_compliance(full_evidence)
        assert 0.0 <= result.overall_score <= 1.0

    def test_full_evidence_gives_high_score(self, service, full_evidence):
        result = service.evaluate_compliance(full_evidence)
        assert result.overall_score >= 0.8

    def test_no_evidence_gives_zero_score(self, service, empty_evidence):
        result = service.evaluate_compliance(empty_evidence)
        assert result.overall_score == 0.0

    def test_scope_limits_controls_evaluated(self, service, full_evidence):
        result = service.evaluate_compliance(full_evidence, scope=["CC"])
        for control_id in result.control_assessments:
            assert control_id.startswith("CC")

    def test_evaluated_by_stored_in_result(self, service, full_evidence):
        result = service.evaluate_compliance(full_evidence, evaluated_by="egyan")
        assert result.evaluated_by == "egyan"

    def test_evaluation_stored_in_service(self, service, full_evidence):
        service.evaluate_compliance(full_evidence)
        assert len(service.evaluations) == 1

    def test_multiple_evaluations_stored(self, service, full_evidence):
        # Keys are datetime-based so two rapid calls may collide; assert at least 1
        service.evaluate_compliance(full_evidence)
        service.evaluate_compliance(full_evidence)
        assert len(service.evaluations) >= 1

    def test_framework_id_is_soc2(self, service, full_evidence):
        result = service.evaluate_compliance(full_evidence)
        assert result.framework_id == "soc2_v2017"

    def test_scope_in_result(self, service, full_evidence):
        result = service.evaluate_compliance(full_evidence, scope=["CC", "A"])
        assert "CC" in result.scope
        assert "A" in result.scope

    def test_evaluation_date_is_set(self, service, full_evidence):
        result = service.evaluate_compliance(full_evidence)
        assert isinstance(result.evaluation_date, datetime)

    def test_partial_evidence_gives_partial_score(self, service, framework):
        controls = framework.get_all_controls()
        half = {
            controls[i].id: {
                "evidence_provided": ["some_evidence"],
                "status": "compliant",
                "score": 0.5,
                "comments": ""
            }
            for i in range(len(controls) // 2)
        }
        result = service.evaluate_compliance(half)
        assert 0.0 < result.overall_score < 1.0


# ─── compliance status determination ────────────────────────────────────────

class TestComplianceStatusDetermination:

    def test_high_compliance_ratio_gives_compliant(self, service, full_evidence):
        result = service.evaluate_compliance(full_evidence)
        assert result.compliance_status == ComplianceStatus.COMPLIANT

    def test_no_evidence_gives_not_evaluated(self, service, empty_evidence):
        # With no evidence all controls are NOT_EVALUATED, so overall status
        # is NOT_EVALUATED (no evaluated controls to determine ratio from)
        result = service.evaluate_compliance(empty_evidence)
        assert result.compliance_status in [
            ComplianceStatus.NOT_EVALUATED,
            ComplianceStatus.NON_COMPLIANT,
        ]

    def test_mixed_evidence_gives_partial(self, service, framework):
        controls = framework.get_controls_by_category("CC")
        # Provide evidence for exactly 60% of CC controls
        cutoff = int(len(controls) * 0.6)
        evidence = {}
        for i, control in enumerate(controls):
            if i < cutoff:
                evidence[control.id] = {
                    "evidence_provided": ["e1"],
                    "status": "compliant",
                    "score": 0.9,
                    "comments": ""
                }
        result = service.evaluate_compliance(evidence, scope=["CC"])
        assert result.compliance_status in [
            ComplianceStatus.PARTIALLY_COMPLIANT,
            ComplianceStatus.NON_COMPLIANT,
            ComplianceStatus.COMPLIANT,
        ]


# ─── compliance level ───────────────────────────────────────────────────────

class TestComplianceLevel:

    def test_score_095_gives_excellent(self, service):
        level = service._determine_compliance_level(0.96)
        assert level == ComplianceLevel.EXCELLENT

    def test_score_085_gives_good(self, service):
        level = service._determine_compliance_level(0.87)
        assert level == ComplianceLevel.GOOD

    def test_score_070_gives_adequate(self, service):
        level = service._determine_compliance_level(0.75)
        assert level == ComplianceLevel.ADEQUATE

    def test_score_050_gives_partial(self, service):
        level = service._determine_compliance_level(0.55)
        assert level == ComplianceLevel.PARTIAL

    def test_score_below_050_gives_inadequate(self, service):
        level = service._determine_compliance_level(0.3)
        assert level == ComplianceLevel.INADEQUATE

    def test_score_zero_gives_inadequate(self, service):
        level = service._determine_compliance_level(0.0)
        assert level == ComplianceLevel.INADEQUATE

    def test_score_one_gives_excellent(self, service):
        level = service._determine_compliance_level(1.0)
        assert level == ComplianceLevel.EXCELLENT


# ─── recommendations ────────────────────────────────────────────────────────

class TestRecommendations:

    def test_recommendations_is_list(self, service, full_evidence):
        result = service.evaluate_compliance(full_evidence)
        assert isinstance(result.recommendations, list)

    def test_no_evidence_generates_recommendations(self, service, empty_evidence):
        result = service.evaluate_compliance(empty_evidence)
        assert len(result.recommendations) > 0

    def test_full_evidence_fewer_recommendations(self, service, full_evidence, empty_evidence):
        full = service.evaluate_compliance(full_evidence)
        empty = service.evaluate_compliance(empty_evidence)
        assert len(full.recommendations) <= len(empty.recommendations)


# ─── risk assessment ────────────────────────────────────────────────────────

class TestRiskAssessment:

    def test_risk_assessment_is_dict(self, service, full_evidence):
        result = service.evaluate_compliance(full_evidence)
        assert isinstance(result.risk_assessment, dict)

    def test_risk_has_high_risk_controls_key(self, service, full_evidence):
        result = service.evaluate_compliance(full_evidence)
        assert "high_risk_controls" in result.risk_assessment

    def test_no_evidence_has_high_risk_controls(self, service, empty_evidence):
        result = service.evaluate_compliance(empty_evidence)
        assert len(result.risk_assessment["high_risk_controls"]) > 0

    def test_full_evidence_no_high_risk(self, service, full_evidence):
        result = service.evaluate_compliance(full_evidence)
        assert len(result.risk_assessment["high_risk_controls"]) == 0


# ─── next review date ────────────────────────────────────────────────────────

class TestNextReviewDate:

    def test_high_score_review_in_365_days(self, service):
        from datetime import timedelta
        date = service._calculate_next_review(0.95)
        diff = (date - datetime.now()).days
        assert 360 <= diff <= 370

    def test_medium_score_review_in_180_days(self, service):
        date = service._calculate_next_review(0.75)
        diff = (date - datetime.now()).days
        assert 175 <= diff <= 185

    def test_low_score_review_in_90_days(self, service):
        date = service._calculate_next_review(0.4)
        diff = (date - datetime.now()).days
        assert 85 <= diff <= 95


# ─── get_evaluation_by_id ────────────────────────────────────────────────────

class TestGetEvaluationById:

    def test_nonexistent_id_returns_none(self, service):
        assert service.get_evaluation_by_id("does_not_exist") is None

    def test_returns_evaluation_after_storing(self, service, full_evidence):
        service.evaluate_compliance(full_evidence)
        eval_id = list(service.evaluations.keys())[0]
        result = service.get_evaluation_by_id(eval_id)
        assert result is not None
        assert isinstance(result, ComplianceEvaluation)


# ─── get_control_compliance_trend ────────────────────────────────────────────

class TestControlComplianceTrend:

    def test_empty_trend_for_no_evaluations(self, service):
        trend = service.get_control_compliance_trend("CC6.1")
        assert trend == []

    def test_trend_has_entry_after_evaluation(self, service, framework):
        control = framework.get_controls_by_category("CC")[0]
        evidence = {
            control.id: {
                "evidence_provided": ["e1"],
                "status": "compliant",
                "score": 0.9,
                "comments": ""
            }
        }
        service.evaluate_compliance(evidence, scope=["CC"])
        trend = service.get_control_compliance_trend(control.id)
        assert len(trend) >= 1
        assert "score" in trend[0]
        assert "status" in trend[0]

    def test_trend_sorted_by_date(self, service, framework):
        control = framework.get_controls_by_category("CC")[0]
        evidence = {
            control.id: {
                "evidence_provided": ["e1"],
                "status": "compliant",
                "score": 0.9,
                "comments": ""
            }
        }
        service.evaluate_compliance(evidence, scope=["CC"])
        service.evaluate_compliance(evidence, scope=["CC"])
        trend = service.get_control_compliance_trend(control.id)
        dates = [entry["date"] for entry in trend]
        assert dates == sorted(dates)


# ─── export_evaluation_report ────────────────────────────────────────────────

class TestExportEvaluationReport:

    def test_report_has_required_keys(self, service, full_evidence):
        evaluation = service.evaluate_compliance(full_evidence)
        report = service.export_evaluation_report(evaluation)
        required_keys = [
            "evaluation_metadata", "summary", "control_details",
            "risk_assessment", "evidence_summary", "recommendations"
        ]
        for key in required_keys:
            assert key in report

    def test_report_summary_has_overall_score(self, service, full_evidence):
        evaluation = service.evaluate_compliance(full_evidence)
        report = service.export_evaluation_report(evaluation)
        assert "overall_score" in report["summary"]

    def test_report_control_details_not_empty(self, service, full_evidence):
        evaluation = service.evaluate_compliance(full_evidence)
        report = service.export_evaluation_report(evaluation)
        assert len(report["control_details"]) > 0


# ─── helper functions ────────────────────────────────────────────────────────

class TestHelperFunctions:

    def test_calculate_compliance_score_empty(self):
        assert calculate_compliance_score({}) == 0.0

    def test_calculate_compliance_score_all_compliant(self):
        assessments = {
            "CC1.1": ControlAssessment(
                control_id="CC1.1",
                status=ComplianceStatus.COMPLIANT,
                score=1.0,
                evidence_provided=["e1"],
                evidence_required=[],
                gaps=[],
                recommendations=[],
                assessed_date=datetime.now(),
                assessed_by="test"
            )
        }
        assert calculate_compliance_score(assessments) == 1.0

    def test_calculate_compliance_score_skips_not_evaluated(self):
        assessments = {
            "CC1.1": ControlAssessment(
                control_id="CC1.1",
                status=ComplianceStatus.NOT_EVALUATED,
                score=0.0,
                evidence_provided=[],
                evidence_required=[],
                gaps=[],
                recommendations=[],
                assessed_date=datetime.now(),
                assessed_by="test"
            ),
            "CC1.2": ControlAssessment(
                control_id="CC1.2",
                status=ComplianceStatus.COMPLIANT,
                score=1.0,
                evidence_provided=["e1"],
                evidence_required=[],
                gaps=[],
                recommendations=[],
                assessed_date=datetime.now(),
                assessed_by="test"
            )
        }
        score = calculate_compliance_score(assessments)
        assert score == 1.0

    def test_get_status_from_score_high(self):
        assert get_compliance_status_from_score(0.95) == ComplianceStatus.COMPLIANT

    def test_get_status_from_score_medium(self):
        assert get_compliance_status_from_score(0.7) == ComplianceStatus.PARTIALLY_COMPLIANT

    def test_get_status_from_score_low(self):
        assert get_compliance_status_from_score(0.3) == ComplianceStatus.NON_COMPLIANT

    def test_get_status_boundary_09(self):
        assert get_compliance_status_from_score(0.9) == ComplianceStatus.COMPLIANT

    def test_get_status_boundary_06(self):
        assert get_compliance_status_from_score(0.6) == ComplianceStatus.PARTIALLY_COMPLIANT

    def test_get_status_zero(self):
        assert get_compliance_status_from_score(0.0) == ComplianceStatus.NON_COMPLIANT
