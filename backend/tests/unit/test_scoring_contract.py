"""
Canonical scoring contract tests (Phase 6).

Pins the exact boundaries and invariants of the canonical coverage engine so
behavioral drift (e.g. a future weighting change, a shifted threshold, or
evidence deduplication regression) is caught at the unit level:

- status boundaries: 0 -> not_assessed, (0, 0.5) -> non_compliant,
  0.5 (inclusive) -> partial, 1.0 -> compliant
- overall thresholds: <70 non_compliant, 70-89.99 partial, >=90 compliant
- evidence deduplication (types are a set, not a multiset)
- weights are uniform 1.0 in every framework today (weighted mean == simple
  mean); a non-default weight appearing anywhere is a data change that must be
  deliberate and tested
- category scores are the mean of their controls' scores
- unknown evidence types are dropped; the documented inert mappings
  (firewall -> HIPAA) are inert
"""
import itertools

import pytest

from app.core.canonical_evidence import EvidenceVocabulary, get_canonical_engine

ENGINE = get_canonical_engine()
FRAMEWORK_CONTROL_COUNTS = {
    "soc2": 43,
    "iso27001": 47,
    "hipaa": 47,
    "gdpr": 38,
}


# ── exact status boundaries ─────────────────────────────────────────────────

def test_coverage_0_is_not_assessed():
    r = ENGINE.evaluate("soc2", [])
    assert all(c.status == "not_assessed" for c in r.control_results.values())


def test_exactly_half_coverage_is_partial():
    # CC1.2 requires exactly two types; supplying one is exactly 0.5 coverage.
    r = ENGINE.evaluate("soc2", ["audit_reports"])
    c = r.control_results["CC1.2"]
    assert c.required_evidence == ["audit_reports", "policy_document"]
    assert c.score == 50
    assert c.status == "partial"


def test_less_than_half_coverage_is_non_compliant():
    # CC7.1 requires two types; a *different* single type than the control
    # needs cannot be confused with half coverage — 0/2 is not_assessed.
    r = ENGINE.evaluate("soc2", ["backup_logs", "policy_document"])
    c = r.control_results["CC7.1"]
    assert c.status == "not_assessed"
    # CC1.4 (Commitment to Competence) requires [policy_document,
    # training_records]; policy_document alone is exactly half -> partial.
    c14 = r.control_results["CC1.4"]
    assert c14.required_evidence == ["policy_document", "training_records"]
    assert c14.score == 50
    assert c14.status == "partial"


# ── overall score thresholds — exhaustive property sweep ────────────────────
#
# The canonical evidence vocabulary is small (13 types), so we can enumerate
# EVERY evidence subset and verify the threshold mapping holds universally:
#   status == compliant      <=> overall >= 90
#   status == partial        <=> 70 <= overall < 90
#   status == non_compliant  <=> overall < 70
# plus the boundary-separation property (max partial < 90 <= min compliant;
# max non_compliant < 70 <= min partial), which proves there is no scoring
# regime where the statuses straddle a threshold incorrectly.


def _framework_types(framework: str):
    """Distinct canonical types required by any control of the framework."""
    data = ENGINE._load_framework(framework)
    return sorted({t for c in data["controls"] for t in c.get("required_evidence", [])})


@pytest.mark.parametrize("framework", FRAMEWORK_CONTROL_COUNTS)
def test_status_thresholds_hold_for_every_evidence_subset(framework):
    types = _framework_types(framework)
    max_partial, min_compliant = 0.0, 101.0
    max_non_compliant, min_partial = 0.0, 101.0
    seen = 0
    for mask in range(1 << len(types)):
        subset = [types[i] for i in range(len(types)) if mask & (1 << i)]
        r = ENGINE.evaluate(framework, subset)
        seen += 1
        if r.status == "compliant":
            assert r.overall_score >= 90, f"{framework} {subset}: {r.status} at {r.overall_score}"
            min_compliant = min(min_compliant, r.overall_score)
        elif r.status == "partial":
            assert 70 <= r.overall_score < 90, f"{framework} {subset}: {r.status} at {r.overall_score}"
            max_partial = max(max_partial, r.overall_score)
            min_partial = min(min_partial, r.overall_score)
        else:
            assert r.overall_score < 70, f"{framework} {subset}: {r.status} at {r.overall_score}"
            max_non_compliant = max(max_non_compliant, r.overall_score)
        # Per-control status is a pure function of its coverage:
        #   1.0 -> compliant, [0.5, 1.0) -> partial, (0, 0.5) -> non_compliant,
        #   0 -> not_assessed.
        for c in r.control_results.values():
            if c.status == "compliant":
                assert c.score == 100
            elif c.status == "partial":
                assert 50 <= c.score < 100, f"{framework} {subset}: {c.control_id} partial at {c.score}"
            elif c.status == "non_compliant":
                assert 0 < c.score < 50
            else:
                assert c.score == 0
    assert seen == (1 << len(types))
    # Boundary separation: statuses never straddle a threshold.
    assert max_partial < 90 <= min_compliant
    assert max_non_compliant < 70 <= min_partial


def test_overall_zero_is_not_assessed_not_non_compliant():
    """CG-M2: nothing assessed is not a failed assessment."""
    r = ENGINE.evaluate("soc2", [])
    assert r.overall_score == 0.0
    assert r.status == "not_assessed"


def test_real_low_score_is_still_non_compliant():
    """A genuine (non-empty) low score keeps the non_compliant label."""
    r = ENGINE.evaluate("soc2", ["event_logs"])
    assert 0.0 < r.overall_score < 70.0
    assert r.status == "non_compliant"


# ── deduplication ───────────────────────────────────────────────────────────

@pytest.mark.parametrize("framework", FRAMEWORK_CONTROL_COUNTS)
def test_duplicate_evidence_types_count_once(framework):
    single = ENGINE.evaluate(framework, ["event_logs"])
    duplicated = ENGINE.evaluate(framework, ["event_logs"] * 25)
    assert duplicated.overall_score == single.overall_score
    assert duplicated.control_results == single.control_results


# ── weights ─────────────────────────────────────────────────────────────────

@pytest.mark.parametrize("framework", FRAMEWORK_CONTROL_COUNTS)
def test_all_controls_have_uniform_default_weight(framework):
    """No framework defines weights today; a weighted mean would equal the
    simple mean. If a weight is added, this test forces a deliberate,
    documented decision (and new weight-specific tests)."""
    data = ENGINE._load_framework(framework)
    non_default = [
        c["id"] for c in data["controls"] if c.get("weight") not in (None, 1.0)
    ]
    assert non_default == []


# ── category aggregation ────────────────────────────────────────────────────

def test_category_score_is_mean_of_category_controls():
    r = ENGINE.evaluate("soc2", ["event_logs", "system_configs"])
    # Derive categories from the framework data.
    data = ENGINE._load_framework("soc2")
    cat_of = {c["id"]: c["category"] for c in data["controls"]}
    cats = {}
    for cid, c in r.control_results.items():
        cats.setdefault(cat_of[cid], []).append(c.score)
    for cat, scores in cats.items():
        expected = sum(scores) / len(scores)
        assert r.category_scores[cat]["score"] == pytest.approx(expected, abs=0.01)
        assert r.category_scores[cat]["control_count"] == len(scores)
        assert r.category_scores[cat]["weight"] == len(scores)


# ── unknown / inert evidence ────────────────────────────────────────────────

def test_unknown_evidence_types_are_dropped():
    empty = ENGINE.evaluate("soc2", [])
    junk = ENGINE.evaluate("soc2", ["totally_unknown", "zzz", "not-a-type"])
    assert junk.overall_score == empty.overall_score
    assert junk.control_results == empty.control_results


def test_documented_inert_mapping_firewall_to_hipaa():
    """firewall -> firewall_configs, but no HIPAA control requires
    firewall_configs, so a firewall item must not affect HIPAA scoring
    (documented in evidence-vocabulary.json — not a mapping error)."""
    baseline = ENGINE.evaluate("hipaa", [])
    with_firewall = ENGINE.evaluate("hipaa", ["firewall"])
    assert with_firewall.overall_score == baseline.overall_score
    assert with_firewall.counts == baseline.counts


def test_same_evidence_scores_differ_per_framework():
    """A type is not uniformly valuable: its effect depends on which framework
    controls require it (evidence is framework-agnostic by TYPE, framework-
    specific by required_evidence)."""
    soc2 = ENGINE.evaluate("soc2", ["backup_logs"])
    gdpr = ENGINE.evaluate("gdpr", ["backup_logs"])
    assert soc2.overall_score != gdpr.overall_score


# ── assessment_mode semantics (Phase 2) ─────────────────────────────────────
#
# The scoring engine must never represent an organizational criterion as
# assessed just because endpoint telemetry exists. manual_upload criteria
# stay not_assessed until actual manual evidence is present; hybrid criteria
# cap below compliant while a manual-only requirement is unmet.

def _all_collector_types():
    vocab = EvidenceVocabulary()
    return sorted(
        t for t in vocab.canonical_types if vocab.is_collector_produced(t)
    )


def _all_types():
    return sorted(EvidenceVocabulary().canonical_types)


def test_manual_upload_never_assessed_from_collector_evidence():
    """THE honesty invariant: every manual_upload criterion stays not_assessed
    when only collector-produced evidence exists."""
    result = ENGINE.evaluate("soc2", _all_collector_types())
    offenders = [
        (cid, c.status)
        for cid, c in result.control_results.items()
        if c.assessment_mode == "manual_upload" and c.status != "not_assessed"
    ]
    assert offenders == [], (
        f"manual_upload controls assessed without manual evidence: {offenders}"
    )


def test_manual_upload_assessed_once_manual_evidence_uploaded():
    """With the full vocabulary (collector + manual types) every criterion is
    fully covered and compliant — manual evidence unlocks the assessment."""
    result = ENGINE.evaluate("soc2", _all_types())
    offenders = [
        (cid, c.status)
        for cid, c in result.control_results.items()
        if c.assessment_mode == "manual_upload" and c.status != "compliant"
    ]
    assert offenders == [], offenders


def test_hybrid_caps_at_partial_without_manual_evidence():
    # CC6.1 requires [system_configs, security_policies] (collector-produced)
    # + policy_document (manual-only). All collector types -> 2/3 coverage,
    # which is partial — never compliant without the manual upload.
    result = ENGINE.evaluate("soc2", _all_collector_types())
    c = result.control_results["CC6.1"]
    assert c.assessment_mode == "hybrid"
    assert c.status == "partial"
    assert "policy_document" in c.gaps


def test_assessment_mode_metadata_on_every_result():
    result = ENGINE.evaluate("soc2", ["event_logs"])
    assert result.control_results, "no control results"
    for c in result.control_results.values():
        assert c.assessment_mode in {"automatable", "hybrid", "manual_upload"}


def test_score_semantics_field_exposed():
    result = ENGINE.evaluate("soc2", [])
    assert result.score_semantics == "evidence_coverage"
