"""
Symmetric encryption helpers for storing sensitive credentials at rest.

Uses Fernet (AES-128-CBC + HMAC-SHA256) from the `cryptography` package,
keyed from the application SECRET_KEY.  The same key that signs JWTs also
encrypts stored credentials — both are invalidated together if the key rotates,
which is the correct behaviour.

Format stored in the DB:  ``enc:<base64-fernet-token>``
This prefix lets us detect and reject legacy plaintext values if any exist.
"""

import base64
import hashlib

from cryptography.fernet import Fernet


def _make_fernet(secret_key: str) -> Fernet:
    """
    Derive a 32-byte Fernet key from the application secret.

    Fernet requires exactly 32 url-safe base64-encoded bytes.
    We SHA-256 the secret key and base64url-encode the digest to get that.
    """
    raw = hashlib.sha256(secret_key.encode()).digest()  # always 32 bytes
    key = base64.urlsafe_b64encode(raw)
    return Fernet(key)


def encrypt_credential(plaintext: str, secret_key: str) -> str:
    """Encrypt a credential string. Returns ``enc:<token>``."""
    if not plaintext:
        return ""
    token = _make_fernet(secret_key).encrypt(plaintext.encode()).decode()
    return f"enc:{token}"


def decrypt_credential(stored: str, secret_key: str) -> str:
    """
    Decrypt a stored credential.

    Returns the plaintext, or raises ``ValueError`` if the value is not a
    recognised encrypted token (missing ``enc:`` prefix).
    """
    if not stored:
        return ""
    if not stored.startswith("enc:"):
        raise ValueError("Stored value does not appear to be encrypted")
    token = stored[4:].encode()
    return _make_fernet(secret_key).decrypt(token).decode()
