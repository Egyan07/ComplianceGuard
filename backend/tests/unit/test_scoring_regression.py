"""
Phase 5 scoring regression tests.

Pin the canonical scoring contract so the pre-canonical divergent behaviors
cannot silently return:

1. Legacy engines omitted controls with no matching evidence from the result
   (SOC 2 baseline showed 17 of 54 controls). Canonical: EVERY control is
   present, with status ``not_assessed`` when it has no evidence.
2. Legacy overall score was the mean over matched controls only. Canonical:
   the overall score is the mean over ALL controls — ``not_assessed`` controls
   count as 0 in the denominator.
3. Legacy scores were 0-1 with two coexisting status algorithms. Canonical:
   0-100 scores, one status-threshold system, one status vocabulary
   (not_assessed / non_compliant / partial / compliant).
4. Legacy per-control scores were hand-authored base scores from evidence
   maps. Canonical: coverage = present / required, binary presence.
"""
import pytest

from app.core.canonical_evidence import get_canonical_engine

ENGINE = get_canonical_engine()

# Every control is present in a canonical evaluation, regardless of evidence.
FRAMEWORK_CONTROL_COUNTS = {
    "soc2": 54,
    "iso27001": 47,
    "hipaa": 47,
    "gdpr": 38,
}


@pytest.mark.parametrize("framework,count", FRAMEWORK_CONTROL_COUNTS.items())
def test_all_controls_present_even_without_evidence(framework, count):
    """Legacy returned only controls that received evidence; canonical returns all."""
    result = ENGINE.evaluate(framework, [])
    assert len(result.control_results) == count
    assert all(r.status == "not_assessed" for r in result.control_results.values())
    assert result.counts["not_assessed"] == count
    assert result.counts["compliant"] == 0


def test_not_assessed_controls_in_denominator():
    """Overall score = mean over ALL controls, not just the assessed ones.

    The legacy engine averaged only controls that received evidence; a sparse
    run showed 17 of 54 controls with a score inflated by the omission. Here
    every control (including not_assessed ones, which score 0) is in the
    denominator.
    """
    result = ENGINE.evaluate("soc2", ["system_configs"])
    assert result.counts["not_assessed"] > 0
    mean_all_controls = sum(r.score for r in result.control_results.values()) / len(
        result.control_results
    )
    assert result.overall_score == pytest.approx(mean_all_controls, abs=0.01)
    # The same holds for every framework: not_assessed cannot inflate the score.
    for framework in FRAMEWORK_CONTROL_COUNTS:
        r = ENGINE.evaluate(framework, ["event_logs"])
        mean_all = sum(c.score for c in r.control_results.values()) / len(r.control_results)
        assert r.overall_score == pytest.approx(mean_all, abs=0.01)


@pytest.mark.parametrize("framework", FRAMEWORK_CONTROL_COUNTS)
def test_score_scale_is_0_to_100(framework):
    """Canonical scores are 0-100; the legacy 0-1 contract is gone."""
    result = ENGINE.evaluate(framework, [])
    assert result.overall_score == 0.0
    full = ENGINE.evaluate(framework, _all_required_evidence(framework))
    assert full.overall_score == 100.0
    assert all(0 <= r.score <= 100 for r in full.control_results.values())


def test_partial_coverage_is_partial_not_base_score():
    """A control with half its required evidence is partial at 50 — never a
    hand-authored base score."""
    # CC7.1 (SOC 2) requires two evidence types; supply exactly one.
    result = ENGINE.evaluate("soc2", ["event_logs"])
    cc71 = result.control_results.get("CC7.1")
    assert cc71 is not None
    assert cc71.status == "partial"
    assert cc71.score == 50


def test_status_vocabulary_is_canonical_only():
    """The only statuses produced are the four canonical ones."""
    result = ENGINE.evaluate("gdpr", ["event_logs", "policy_document"])
    statuses = {r.status for r in result.control_results.values()}
    assert statuses <= {"compliant", "partial", "non_compliant", "not_assessed"}


def test_overall_status_derived_from_score_thresholds():
    """One threshold system: <70 non_compliant, 70-89 partial, >=90 compliant.

    The all-not-assessed (empty evidence) case is the single exception and is
    labelled not_assessed (CG-M2) — covered in test_scoring_contract.
    """
    low = ENGINE.evaluate("soc2", ["event_logs"])
    assert 0.0 < low.overall_score < 70.0
    assert low.status == "non_compliant"


def test_full_coverage_yields_compliant_everywhere():
    """Every control fully evidenced → compliant, overall 100."""
    for framework in FRAMEWORK_CONTROL_COUNTS:
        result = ENGINE.evaluate(framework, _all_required_evidence(framework))
        assert result.counts["not_assessed"] == 0
        assert result.counts["non_compliant"] == 0
        assert result.counts["partial"] == 0
        assert result.counts["compliant"] == FRAMEWORK_CONTROL_COUNTS[framework]
        assert result.overall_score == 100.0
        assert result.status == "compliant"


def test_legacy_aliases_translate_to_canonical_types():
    """Web-mode legacy types are translated, not dropped (the old vocabulary
    must keep working through the canonical engine)."""
    # users -> user_provisioning, s3_encryption -> encryption_policies.
    result = ENGINE.evaluate("soc2", ["users", "s3_encryption"])
    assert result.counts["not_assessed"] < FRAMEWORK_CONTROL_COUNTS["soc2"]
    assert result.overall_score > 0.0


def _all_required_evidence(framework: str) -> list:
    """Union of every required evidence type for a framework (full coverage)."""
    engine = get_canonical_engine()
    data = engine._load_framework(framework)
    required = {
        req
        for control in data.get("controls", [])
        for req in control.get("required_evidence", [])
    }
    return sorted(required)
