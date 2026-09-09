"""Hashed storage for one-time email tokens (password reset, email verification).

These tokens arrive by email, so the raw value is known only to the recipient.
Storing the raw token meant a database read leak (backup, log dump, SQL
injection elsewhere) converted directly into account takeover. Instead we
store a SHA-256 hash and compare hashes on use — the same model as password
hashes, minus the need for a slow KDF (the tokens are 256-bit random values,
so a fast hash is not brute-forceable).

The raw token is never logged. Only the hash is persisted.

Legacy compatibility: rows written before hashing was introduced hold the
plaintext token. ``verify_stored_token`` accepts those transparently so an
outstanding pre-upgrade email link keeps working; callers should re-hash
such values opportunistically (``looks_hashed`` detects them).
"""

import hashlib
import hmac

_HASH_LEN = 64  # hex-encoded SHA-256


def hash_token(raw_token: str) -> str:
    """Return the hex SHA-256 of an email token. This is what gets stored."""
    return hashlib.sha256(raw_token.encode("utf-8")).hexdigest()


def looks_hashed(stored: str) -> bool:
    """True when a stored value is already a token hash (not legacy plaintext)."""
    return bool(stored) and len(stored) == _HASH_LEN and all(
        c in "0123456789abcdef" for c in stored
    )


def verify_stored_token(raw_token: str, stored: str) -> bool:
    """Constant-time comparison of a presented token against the stored value.

    Accepts both hashed storage (current) and legacy plaintext storage
    (pre-migration rows), so no outstanding email link breaks on upgrade.
    """
    if not raw_token or not stored:
        return False
    if hmac.compare_digest(hash_token(raw_token), stored):
        return True
    # Legacy plaintext row — compare directly, still constant-time.
    return hmac.compare_digest(raw_token, stored)
