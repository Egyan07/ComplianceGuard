"""
Regression tests for Phase 1 key-domain separation.

JWT signing, credential encryption, and the audit-chain HMAC must each be
driven by their own dedicated key when configured (JWT_SECRET,
CREDENTIAL_ENCRYPTION_KEY, AUDIT_HMAC_KEY), while defaulting to SECRET_KEY so
existing deployments behave exactly as before.
"""

import pytest

from app.core.auth import create_access_token, verify_access_token
from app.core.config import settings
from app.core.credential_crypto import decrypt_credential, encrypt_credential
from app.services.audit_service import compute_entry_hash


# ── default behavior (no dedicated keys) is unchanged ────────────────────────

def test_default_jwt_uses_secret_key(monkeypatch):
    monkeypatch.setattr(settings, "secret_key", "master-secret-A")
    monkeypatch.setattr(settings, "jwt_secret", None)

    token = create_access_token({"sub": "user@example.com"})
    assert verify_access_token(token) is not None

    # Rotating the master secret invalidates tokens signed under it (unchanged behavior).
    monkeypatch.setattr(settings, "secret_key", "master-secret-B")
    assert verify_access_token(token) is None


def test_default_credential_roundtrip(monkeypatch):
    monkeypatch.setattr(settings, "secret_key", "master-secret-A")
    monkeypatch.setattr(settings, "credential_encryption_key", None)

    enc = encrypt_credential("AKIA1234", "master-secret-A")
    assert enc.startswith("enc:")
    assert decrypt_credential(enc, "master-secret-A") == "AKIA1234"


# ── JWT domain is independent of SECRET_KEY when JWT_SECRET is set ───────────

def test_jwt_uses_dedicated_key_independently_of_secret_key(monkeypatch):
    monkeypatch.setattr(settings, "secret_key", "master-secret-A")
    monkeypatch.setattr(settings, "jwt_secret", "jwt-secret-1")

    token = create_access_token({"sub": "user@example.com"})
    assert verify_access_token(token) is not None

    # Rotating the master secret must NOT invalidate the JWT_SECRET-signed token.
    monkeypatch.setattr(settings, "secret_key", "totally-different-master")
    assert verify_access_token(token) is not None

    # Rotating the JWT secret itself invalidates it.
    monkeypatch.setattr(settings, "jwt_secret", "jwt-secret-2")
    assert verify_access_token(token) is None


# ── credential encryption domain ─────────────────────────────────────────────

def test_credential_uses_dedicated_key_when_configured(monkeypatch):
    monkeypatch.setattr(settings, "secret_key", "master-secret-A")
    monkeypatch.setattr(settings, "credential_encryption_key", "cred-key-1")

    enc = encrypt_credential("SECRET-ACCESS-KEY", "master-secret-A")
    assert decrypt_credential(enc, "master-secret-A") == "SECRET-ACCESS-KEY"

    # Changing the encryption key makes the value undecryptable (no silent cross-domain use).
    monkeypatch.setattr(settings, "credential_encryption_key", "cred-key-2")
    with pytest.raises(ValueError):
        decrypt_credential(enc, "master-secret-A")


def test_credential_legacy_value_decrypts_during_migration(monkeypatch):
    """Values encrypted before CREDENTIAL_ENCRYPTION_KEY existed must still decrypt."""
    # Simulate a legacy value written with only SECRET_KEY (pre-separation).
    monkeypatch.setattr(settings, "secret_key", "master-secret-A")
    monkeypatch.setattr(settings, "credential_encryption_key", None)
    legacy_enc = encrypt_credential("LEGACY-VALUE", "master-secret-A")

    # Operator now enables the dedicated key; the old value still decrypts via fallback.
    monkeypatch.setattr(settings, "credential_encryption_key", "cred-key-1")
    assert decrypt_credential(legacy_enc, "master-secret-A") == "LEGACY-VALUE"


# ── audit HMAC domain ────────────────────────────────────────────────────────

def test_audit_hash_uses_dedicated_key_when_configured(monkeypatch):
    monkeypatch.setattr(settings, "secret_key", "master-secret-A")
    monkeypatch.setattr(settings, "audit_hmac_key", None)

    payload = dict(event_type="test", user_id=1, framework=None, score=None,
                   detail={"a": 1}, created_at="2026-01-01T00:00:00+00:00")
    default_hash = compute_entry_hash(None, payload["event_type"], payload["user_id"],
                                      payload["framework"], payload["score"],
                                      payload["detail"], payload["created_at"])

    # With a dedicated audit key, the same payload hashes differently.
    monkeypatch.setattr(settings, "audit_hmac_key", "audit-key-1")
    dedicated_hash = compute_entry_hash(None, payload["event_type"], payload["user_id"],
                                        payload["framework"], payload["score"],
                                        payload["detail"], payload["created_at"])
    assert dedicated_hash != default_hash
