"""Validates GDPR_EVIDENCE_CONTROL_MAP references real control IDs."""
from app.core.gdpr_evidence_map import GDPR_EVIDENCE_CONTROL_MAP
from app.core.gdpr_controls import create_gdpr_framework


def test_all_control_ids_exist_in_framework():
    fw = create_gdpr_framework()
    valid_ids = {c.id for c in fw.get_all_controls()}
    bad = []
    for etype, ctrl_map in GDPR_EVIDENCE_CONTROL_MAP.items():
        for control_id in ctrl_map:
            if control_id not in valid_ids:
                bad.append(f"{etype} -> {control_id}")
    assert not bad, f"Invalid control IDs in map: {bad}"


def test_all_scores_between_zero_and_one():
    for etype, ctrl_map in GDPR_EVIDENCE_CONTROL_MAP.items():
        for control_id, score in ctrl_map.items():
            assert 0 < score <= 1.0, f"Bad score {score} for {etype}->{control_id}"


def test_map_covers_expected_evidence_types():
    expected = {
        "s3_encryption", "iam_policy", "s3_public_access", "iam_mfa",
        "event_logs", "security_settings", "services", "firewall",
        "users", "network", "software", "file_permissions",
        "system_info", "update_status",
    }
    assert expected.issubset(set(GDPR_EVIDENCE_CONTROL_MAP.keys()))


def test_map_covers_document_evidence_types():
    expected = {
        "policy_document", "security_policies", "training_records",
        "incident_reports", "audit_reports",
    }
    assert expected.issubset(set(GDPR_EVIDENCE_CONTROL_MAP.keys()))


def test_security_of_processing_is_primary_target():
    assert "Art.32.1" in GDPR_EVIDENCE_CONTROL_MAP["s3_encryption"]
    assert "Art.32.1" in GDPR_EVIDENCE_CONTROL_MAP["iam_mfa"]
    assert "Art.33.1" in GDPR_EVIDENCE_CONTROL_MAP["incident_reports"]
