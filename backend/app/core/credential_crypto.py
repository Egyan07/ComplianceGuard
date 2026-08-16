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

from app.core.config import settings

logger = logging.getLogger(__name__)

# Domain-separation label — changing this value invalidates all existing
# encrypted credentials. Bump the version suffix if you ever need to rotate
# the KDF itself (not the input secret).
_FERNET_INFO = b"complianceguard:credential-encryption:v1"

# The dedicated CREDENTIAL_ENCRYPTION_KEY replaces SECRET_KEY as the KDF
# input when set (so credential encryption stops sharing a key with JWT
# signing and the audit chain). When unset we fall back to SECRET_KEY — the
# pre-separation behavior — so existing deployments are unaffected.

def _encryption_material() -> str:
    return settings.credential_encryption_key or settings.secret_key


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
    """Encrypt a credential string. Returns ``enc:<token>``.

    ``secret_key`` is the caller-supplied key (normally ``settings.secret_key``)
    used for the legacy fallback path. Current encryption always uses the
    configured encryption material (CREDENTIAL_ENCRYPTION_KEY or SECRET_KEY).
    """
    if not plaintext:
        return ""
    token = _make_fernet(_encryption_material()).encrypt(plaintext.encode()).decode()
    return f"enc:{token}"


def decrypt_credential(stored: str, secret_key: str) -> str:
    """
    Decrypt a stored credential.

    Tries, in order:
      1. the current encryption material (CREDENTIAL_ENCRYPTION_KEY or
         SECRET_KEY) via HKDF,
      2. SECRET_KEY via HKDF — the pre-key-separation derivation, so values
         written before CREDENTIAL_ENCRYPTION_KEY was introduced still decrypt
         during the migration window,
      3. the legacy raw SHA-256(SECRET_KEY) derivation from before HKDF.

    Logs a warning on any fallback so ops can see the drift and re-save.

    Raises ``ValueError`` if the value is not a recognised encrypted token or
    none of the keys can decrypt it.
    """
    if not stored:
        return ""
    if not stored.startswith("enc:"):
        raise ValueError("Stored value does not appear to be encrypted")
    token = stored[4:].encode()

    # 1) Current encryption material (CREDENTIAL_ENCRYPTION_KEY or SECRET_KEY).
    try:
        return _make_fernet(_encryption_material()).decrypt(token).decode()
    except InvalidToken:
        pass

    # 2) Pre-key-separation fallback: HKDF derived from SECRET_KEY. Only
    #    attempted when a dedicated encryption key is configured (otherwise
    #    this is identical to attempt 1 and would log a false drift warning).
    if _encryption_material() != secret_key:
        try:
            plaintext = _make_fernet(secret_key).decrypt(token).decode()
            logger.warning(
                "Decrypted credential with SECRET_KEY fallback (pre-key-separation) "
                "— re-save to upgrade to the dedicated encryption key."
            )
            return plaintext
        except InvalidToken:
            pass

    # 3) Legacy raw SHA-256(SECRET_KEY) derivation from before the HKDF migration.
    try:
        plaintext = Fernet(_legacy_fernet_key(secret_key)).decrypt(token).decode()
        logger.warning(
            "Decrypted credential with legacy key derivation — re-save "
            "to upgrade to HKDF-derived key."
        )
        return plaintext
    except InvalidToken as e:
        raise ValueError("Could not decrypt credential") from e
