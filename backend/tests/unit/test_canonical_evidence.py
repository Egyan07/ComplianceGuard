"""
Unit tests for the Phase 4 canonical scoring engine
(app.core.canonical_evidence + app.core.canonical_router).
"""
import pytest

from app.core.canonical_evidence import (
    CanonicalEngine,
    EvidenceVocabulary,
    STATUS_COMPLIANT,
    STATUS_NOT_ASSESSED,
    STATUS_NON_COMPLIANT,
    STATUS_PARTIAL,
    get_canonical_engine,
)
from app.core.canonical_router import evaluate_from_evidence_canonical


@pytest.fixture(scope="module")
def engine() -> CanonicalEngine:
    return get_canonical_engine()


class TestEvidenceVocabulary:
    def test_canonical_types_count(self):
        vocab = EvidenceVocabulary()
        assert len(vocab.canonical_types) == 13
        assert "event_logs" in vocab.canonical_types
        assert "system_configs" in vocab.canonical_types

    def test_identity_translation(self):
        vocab = EvidenceVocabulary()
        assert vocab.translate(["event_logs"]) == {"event_logs"}
        assert vocab.translate(["policy_document"]) == {"policy_document"}

    def test_legacy_alias_translation(self):
        vocab = EvidenceVocabulary()
        assert vocab.translate(["users"]) == {"user_provisioning"}
        assert vocab.translate(["s3_encryption"]) == {"encryption_policies"}
        assert vocab.translate(["firewall"]) == {"firewall_configs"}
        assert vocab.translate(["system_info", "services", "software", "file_permissions"]) == {
            "system_configs"
        }

    def test_noise_types_dropped(self):
        vocab = EvidenceVocabulary()
        assert vocab.translate(["manual_upload", "document", "text", "unknown"]) == set()


class TestCanonicalEngine:
    def test_frameworks_load(self, engine):
        for fw in ["soc2", "iso27001", "hipaa", "gdpr"]:
            ev = engine.evaluate(fw, [])
            assert ev.control_results  # all controls present
            assert all(r.status == STATUS_NOT_ASSESSED for r in ev.control_results.values())
            assert ev.overall_score == 0.0
            assert ev.status == STATUS_NON_COMPLIANT

    def test_full_coverage_is_compliant(self, engine):
        vocab = EvidenceVocabulary()
        all_canonical = sorted(vocab.canonical_types)
        for fw in ["soc2", "iso27001", "hipaa", "gdpr"]:
            ev = engine.evaluate(fw, all_canonical)
            assert ev.counts[STATUS_NON_COMPLIANT] == 0
            assert ev.overall_score > 90.0

    def test_legacy_evidence_translates(self, engine):
        # The legacy-only technical set should produce the same result as its
        # canonical translation.
        legacy = ["s3_encryption", "iam_policy", "event_logs", "firewall", "users", "network"]
        canonical = ["encryption_policies", "user_provisioning", "event_logs",
                     "firewall_configs", "user_provisioning", "network_configs"]
        a = engine.evaluate("soc2", legacy)
        b = engine.evaluate("soc2", canonical)
        assert a.overall_score == b.overall_score
        assert a.counts == b.counts

    def test_single_evidence_matches_expected_control(self, engine):
        # A1.3 (SOC 2) requires exactly one type: system_configs — full coverage.
        ev = engine.evaluate("soc2", ["system_configs"])
        assert ev.control_results["A1.3"].status == STATUS_COMPLIANT
        assert ev.control_results["A1.3"].score == 100
        assert ev.control_results["CC1.1"].status == STATUS_NOT_ASSESSED
        assert ev.control_results["A1.3"].available_evidence == ["system_configs"]

    def test_partial_coverage_when_evidence_incomplete(self, engine):
        # CC7.1 requires [event_logs, system_configs]; only one present → 50%.
        ev = engine.evaluate("soc2", ["event_logs"])
        assert ev.control_results["CC7.1"].status == STATUS_PARTIAL
        assert ev.control_results["CC7.1"].score == 50
        assert ev.control_results["CC7.1"].gaps == ["system_configs"]

    def test_duplicates_count_once(self, engine):
        single = engine.evaluate("soc2", ["event_logs", "event_logs", "event_logs"])
        double = engine.evaluate("soc2", ["event_logs", "event_logs"])
        assert single.overall_score == double.overall_score

    def test_score_bounds(self, engine):
        for fw in ["soc2", "iso27001", "hipaa", "gdpr"]:
            for types in ([], ["event_logs"], ["event_logs", "policy_document"]):
                ev = engine.evaluate(fw, types)
                assert 0.0 <= ev.overall_score <= 100.0
                for r in ev.control_results.values():
                    assert 0 <= r.score <= 100
                    assert r.status in {
                        STATUS_COMPLIANT, STATUS_PARTIAL, STATUS_NON_COMPLIANT, STATUS_NOT_ASSESSED
                    }

    def test_unknown_framework_raises(self, engine):
        with pytest.raises(Exception):
            engine.evaluate("pci_dss", [])


class TestCanonicalRouterAdapter:
    def test_legacy_response_shape(self):
        result = evaluate_from_evidence_canonical("soc2", ["event_logs", "system_configs"])
        assert result["engine"] == "canonical_v1"
        assert result["framework_id"] == "soc2_v2017"
        # Canonical contract: 0-100 and canonical status vocabulary.
        assert 0.0 <= result["overall_score"] <= 100.0
        assert result["compliance_status"] in {"compliant", "partial", "non_compliant", "not_assessed"}
        assert result["compliance_level"] in {"excellent", "good", "adequate", "partial", "inadequate"}
        assert result["control_count"] == 54
        assert result["compliant_controls"] >= 0
        assert "A1.3" in result["control_results"]
        assert result["control_results"]["A1.3"]["score"] == 100

    def test_iso_hipaa_gdpr_shapes(self):
        for fw in ["iso27001", "hipaa", "gdpr"]:
            result = evaluate_from_evidence_canonical(fw, ["policy_document", "event_logs"])
            assert result["engine"] == "canonical_v1"
            assert result["control_count"] > 0
            assert 0.0 <= result["overall_score"] <= 100.0
            assert result["compliance_status"] in {"compliant", "partial", "non_compliant", "not_assessed"}
