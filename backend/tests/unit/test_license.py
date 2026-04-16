"""Tests for the Ed25519 license key verification module."""
import pytest
import json
import base64
from app.core.license import verify_license_key, is_feature_allowed


def test_verify_rejects_empty():
    assert verify_license_key("") == {"valid": False, "error": "Empty license key"}


def test_verify_rejects_none_like():
    result = verify_license_key("   ")
    assert result["valid"] is False


def test_verify_rejects_wrong_part_count():
    result = verify_license_key("onlyone")
    assert result["valid"] is False

    result2 = verify_license_key("a.b.c")
    assert result2["valid"] is False


def test_verify_rejects_bad_signature():
    """A well-formed payload with a tampered signature must be rejected."""
    payload = json.dumps({
        "licenseId": "test-001",
        "tier": "pro",
        "email": "user@example.com",
        "maxMachines": 10,
        "expiresAt": "2030-01-01T00:00:00Z",
    }).encode()
    payload_b64 = base64.urlsafe_b64encode(payload).rstrip(b"=").decode()
    fake_sig = base64.urlsafe_b64encode(b"\x00" * 64).rstrip(b"=").decode()

    result = verify_license_key(f"{payload_b64}.{fake_sig}")
    assert result["valid"] is False
    assert "signature" in result["error"].lower() or "invalid" in result["error"].lower()


def test_verify_rejects_garbage_payload():
    garbage = base64.urlsafe_b64encode(b"not-json").rstrip(b"=").decode()
    fake_sig = base64.urlsafe_b64encode(b"\x00" * 64).rstrip(b"=").decode()
    result = verify_license_key(f"{garbage}.{fake_sig}")
    assert result["valid"] is False


def test_verify_rejects_unknown_tier():
    payload = json.dumps({
        "licenseId": "test-001",
        "tier": "superduper",
        "expiresAt": "2030-01-01T00:00:00Z",
    }).encode()
    payload_b64 = base64.urlsafe_b64encode(payload).rstrip(b"=").decode()
    fake_sig = base64.urlsafe_b64encode(b"\x00" * 64).rstrip(b"=").decode()
    result = verify_license_key(f"{payload_b64}.{fake_sig}")
    assert result["valid"] is False


def test_is_feature_allowed_pro_gets_everything():
    for feature in ["all_controls", "per_control_scoring", "pdf_reports", "evaluation_history"]:
        assert is_feature_allowed("pro", feature) is True


def test_is_feature_allowed_enterprise_gets_everything():
    assert is_feature_allowed("enterprise", "pdf_reports") is True


def test_is_feature_allowed_free_blocked_from_pro_features():
    assert is_feature_allowed("free", "pdf_reports") is False
    assert is_feature_allowed("free", "evaluation_history") is False
    assert is_feature_allowed("free", "per_control_scoring") is False


def test_is_feature_allowed_free_for_ungated_feature():
    assert is_feature_allowed("free", "collect_evidence") is True
