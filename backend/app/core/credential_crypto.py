"""
Symmetric encryption helpers for storing sensitive credentials at rest.

Uses Fernet (AES-128-CBC + HMAC-SHA256) from the `cryptography` package.
The Fernet key is derived from the application SECRET_KEY using HKDF-SHA256
with a domain-separation label, so the key used to encrypt credentials is
*cryptographically distinct* from the raw SECRET_KEY used to sign JWTs.

A heap dump that exposes the derived Fernet key therefore does not reveal
the JWT signing key (HKDF is one-way), and vice versa. Rotating SECRET_KEY
rotates both keys together, which is the correct operational behaviour.

Format stored in the DB:  ``enc:<base64-fernet-token>``
The prefix lets us detect and reject legacy plaintext values.
"""

import base64
import hashlib
import logging

from cryptography.fernet import Fernet, InvalidToken
from cryptography.hazmat.primitives import hashes
from cryptography.hazmat.primitives.kdf.hkdf import HKDF

logger = logging.getLogger(__name__)

# Domain-separation label — changing this value invalidates all existing
# encrypted credentials. Bump the version suffix if you ever need to rotate
# the KDF itself (not the input secret).
_FERNET_INFO = b"complianceguard:credential-encryption:v1"


def _derive_fernet_key(secret_key: str) -> bytes:
    """Derive a 32-byte, base64-encoded Fernet key via HKDF-SHA256."""
    raw = HKDF(
        algorithm=hashes.SHA256(),
        length=32,
        salt=None,
        info=_FERNET_INFO,
    ).derive(secret_key.encode())
    return base64.urlsafe_b64encode(raw)


def _make_fernet(secret_key: str) -> Fernet:
    return Fernet(_derive_fernet_key(secret_key))


def _legacy_fernet_key(secret_key: str) -> bytes:
    """
    Pre-HKDF derivation: raw SHA-256(secret_key), base64 encoded.

    Retained only so tokens written before the HKDF migration can still be
    decrypted. New encryptions always use _derive_fernet_key.
    """
    raw = hashlib.sha256(secret_key.encode()).digest()
    return base64.urlsafe_b64encode(raw)


def encrypt_credential(plaintext: str, secret_key: str) -> str:
    """Encrypt a credential string. Returns ``enc:<token>``."""
    if not plaintext:
        return ""
    token = _make_fernet(secret_key).encrypt(plaintext.encode()).decode()
    return f"enc:{token}"


def decrypt_credential(stored: str, secret_key: str) -> str:
    """
    Decrypt a stored credential.

    Tries the current HKDF-derived key first; falls back to the legacy
    SHA-256 derivation for values written before the migration. Logs a
    one-line warning when falling back so ops can see the drift.

    Raises ``ValueError`` if the value is not a recognised encrypted token.
    """
    if not stored:
        return ""
    if not stored.startswith("enc:"):
        raise ValueError("Stored value does not appear to be encrypted")
    token = stored[4:].encode()

    try:
        return _make_fernet(secret_key).decrypt(token).decode()
    except InvalidToken:
        # Legacy path: value was written before HKDF. Best-effort fallback.
        try:
            plaintext = Fernet(_legacy_fernet_key(secret_key)).decrypt(token).decode()
            logger.warning(
                "Decrypted credential with legacy key derivation — re-save "
                "to upgrade to HKDF-derived key."
            )
            return plaintext
        except InvalidToken as e:
            raise ValueError("Could not decrypt credential") from e
