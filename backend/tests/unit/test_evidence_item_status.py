"""
CG-M1 regression: an evidence item's status must be DERIVED from its payload,
never hardcoded to "compliant". Non-compliant or errored resources must never
surface as COMPLIANT in the UI.
"""

import pytest

from app.services.evidence_collector import derive_evidence_item_status


def _s3_evidence(bucket_statuses):
    """Shape mirroring app.integrations.aws collect_s3_encryption_evidence."""
    encrypted = sum(1 for s in bucket_statuses if s == "compliant")
    return {
        "evidence_type": "s3_encryption",
        "total_buckets": len(bucket_statuses),
        "encrypted_buckets": encrypted,
        "bucket_encryption_status": [
            {"bucket_name": f"b{i}", "encryption_enabled": s == "compliant",
             "compliance_status": s} for i, s in enumerate(bucket_statuses)
        ],
        "encryption_compliance_rate": round(encrypted / len(bucket_statuses) * 100, 2)
        if bucket_statuses else 100.0,
    }


def _iam_evidence(policy_statuses):
    """Shape mirroring collect_iam_policy_evidence."""
    over = sum(1 for s in policy_statuses if s == "non_compliant")
    return {
        "evidence_type": "iam_policy",
        "total_policies": len(policy_statuses),
        "over_privileged_policies": over,
        "policy_analysis": [
            {"policy_name": f"p{i}", "is_over_privileged": s == "non_compliant",
             "risk_factors": ["x"] if s == "non_compliant" else [],
             "compliance_status": s} for i, s in enumerate(policy_statuses)
        ],
        "compliance_rate": round((len(policy_statuses) - over) / len(policy_statuses) * 100, 2)
        if policy_statuses else 100.0,
    }


class TestDeriveEvidenceItemStatus:
    def test_all_encrypted_buckets_is_compliant(self):
        assert derive_evidence_item_status(_s3_evidence(["compliant", "compliant"])) == "compliant"

    def test_unencrypted_bucket_is_non_compliant_not_compliant(self):
        # CG-M1 core: a non-compliant bucket used to be stored as "compliant".
        assert derive_evidence_item_status(_s3_evidence(["compliant", "non_compliant"])) == "non_compliant"

    def test_bucket_api_error_is_error(self):
        assert derive_evidence_item_status(_s3_evidence(["compliant", "error"])) == "error"

    def test_over_privileged_iam_policy_is_non_compliant(self):
        assert derive_evidence_item_status(_iam_evidence(["compliant", "non_compliant"])) == "non_compliant"

    def test_clean_iam_policies_is_compliant(self):
        assert derive_evidence_item_status(_iam_evidence(["compliant"])) == "compliant"

    def test_failed_collection_shape_is_error(self):
        failed = {"evidence_type": "s3_encryption", "error": "AccessDenied", "source": "aws"}
        assert derive_evidence_item_status(failed) == "error"

    def test_unknown_payload_is_not_assessed_never_compliant(self):
        # No compliance markers, no rates -> must NOT default to compliant.
        assert derive_evidence_item_status({"evidence_type": "future_thing", "data": {"x": 1}}) == "not_assessed"
        assert derive_evidence_item_status(None) == "not_assessed"

    def test_sub_100_rate_is_non_compliant_even_without_markers(self):
        assert derive_evidence_item_status(
            {"evidence_type": "s3_encryption", "encryption_compliance_rate": 50.0}
        ) == "non_compliant"
