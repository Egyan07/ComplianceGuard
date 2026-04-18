"""
License key verification for ComplianceGuard web mode.

Mirrors the Ed25519 verification logic from electron/licensing/license-crypto.js.
Only the public key is shipped — private key is kept offline.
"""

import json
import base64
from datetime import datetime, timezone
from typing import Any

from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PublicKey
from cryptography.hazmat.primitives.serialization import load_pem_public_key
from cryptography.exceptions import InvalidSignature

# Must match the public key in electron/licensing/license-crypto.js
PUBLIC_KEY_PEM = b"""-----BEGIN PUBLIC KEY-----
MCowBQYDK2VwAyEARu9Q8wPUkdj2SaTNXwD5nPHOsYBg72zt9pN9BEZmn54=
-----END PUBLIC KEY-----"""

GRACE_PERIOD_DAYS = 7
VALID_TIERS = {"free", "pro", "enterprise"}

# Pro-gated features — mirrors electron/licensing/tier-constants.js FEATURE_GATES
PRO_FEATURES = {
    "all_controls",
    "per_control_scoring",
    "remediation",
    "pdf_reports",
    "evidence_upload",
    "evaluation_history",
}


def verify_license_key(key_string: str) -> dict[str, Any]:
    """
    Verify an Ed25519-signed license key.

    Returns a dict with:
      - valid (bool)
      - error (str) on failure
      - payload (dict), tier (str), days_remaining (int),
        is_expired (bool), is_grace_period (bool) on success
    """
    if not key_string or not isinstance(key_string, str):
        return {"valid": False, "error": "Empty license key"}

    parts = key_string.strip().split(".")
    if len(parts) != 2:
        return {"valid": False, "error": "Invalid key format"}

    payload_b64, signature_b64 = parts

    # Decode payload
    try:
        padding = "=" * (-len(payload_b64) % 4)
        payload_bytes = base64.urlsafe_b64decode(payload_b64 + padding)
        payload = json.loads(payload_bytes.decode("utf-8"))
    except Exception:
        return {"valid": False, "error": "Invalid key data"}

    # Validate required fields
    required = {"licenseId", "tier", "expiresAt"}
    missing = required - payload.keys()
    if missing:
        return {"valid": False, "error": f"Incomplete license data: missing {missing}"}

    if payload["tier"] not in VALID_TIERS:
        return {"valid": False, "error": f"Unknown tier: {payload['tier']}"}

    # Verify Ed25519 signature
    try:
        padding = "=" * (-len(signature_b64) % 4)
        signature = base64.urlsafe_b64decode(signature_b64 + padding)
        public_key: Ed25519PublicKey = load_pem_public_key(PUBLIC_KEY_PEM)  # type: ignore[assignment]
        public_key.verify(signature, payload_bytes)
    except InvalidSignature:
        return {"valid": False, "error": "Invalid license signature"}
    except Exception as e:
        return {"valid": False, "error": f"Signature verification error: {e}"}

    # Check expiry
    try:
        expires_at = datetime.fromisoformat(payload["expiresAt"].replace("Z", "+00:00"))
    except ValueError:
        return {"valid": False, "error": "Invalid expiry date"}

    now = datetime.now(timezone.utc)
    days_remaining = (expires_at - now).days
    is_expired = days_remaining < 0
    is_grace_period = is_expired and days_remaining >= -GRACE_PERIOD_DAYS

    if is_expired and not is_grace_period:
        return {"valid": False, "error": "License expired", "payload": payload}

    return {
        "valid": True,
        "payload": payload,
        "tier": payload["tier"],
        "days_remaining": max(0, days_remaining),
        "is_expired": is_expired,
        "is_grace_period": is_grace_period,
    }


def is_feature_allowed(tier: str, feature: str) -> bool:
    """Return True if the given tier has access to the named feature."""
    if tier in ("pro", "enterprise"):
        return True
    return feature not in PRO_FEATURES
