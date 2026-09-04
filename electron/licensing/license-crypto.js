const crypto = require('crypto');

// Ed25519 public keys used to verify license signatures.
//
// SECURITY (rotation in v4.0.0): the previous signing keypair was
// generated inside the packaged source tree (electron/licensing/), so the
// private key could end up inside the application ASAR. That keypair is
// treated as COMPROMISED and REVOKED: its public key is NOT listed below, so
// licenses signed with the old private key are rejected. Existing licenses
// therefore need to be re-issued with the current keypair (see
// docs/release-and-signing.md / generate-key.js).
//
// Only the public key ships with the app. The matching private key is held
// outside the repository (see generate-key.js --dir) and must never be
// written under any directory that electron-builder packages.
const ACCEPTED_PUBLIC_KEYS = [
  // v4.0.0 production keypair (rotated 2026-09-04).
  `-----BEGIN PUBLIC KEY-----
MCowBQYDK2VwAyEAAXl/LPC87Mil4AJn5P4zYz5rTVJKR6RfHwq2fU1LsjU=
-----END PUBLIC KEY-----`,
];

function verifyLicenseKey(keyString, acceptedPublicKeys = ACCEPTED_PUBLIC_KEYS) {
  try {
    if (!keyString || typeof keyString !== 'string') {
      return { valid: false, error: 'Invalid key format' };
    }

    const parts = keyString.trim().split('.');
    if (parts.length !== 2) {
      return { valid: false, error: 'Invalid key format' };
    }

    const [payloadB64, signatureB64] = parts;
    const payloadBuffer = Buffer.from(payloadB64, 'base64url');
    const signatureBuffer = Buffer.from(signatureB64, 'base64url');

    let payload;
    try {
      payload = JSON.parse(payloadBuffer.toString('utf8'));
    } catch {
      return { valid: false, error: 'Invalid key data' };
    }

    // Verify required fields
    if (!payload.licenseId || !payload.tier || !payload.expiresAt) {
      return { valid: false, error: 'Incomplete license data' };
    }

    // Verify signature against every accepted public key. The signature is
    // over the raw payload bytes, so each candidate key is tried until one
    // verifies (keys are explicit and few; deterministic order).
    let signatureValid = false;
    for (const pem of acceptedPublicKeys || []) {
      try {
        if (crypto.verify(null, payloadBuffer, pem, signatureBuffer)) {
          signatureValid = true;
          break;
        }
      } catch {
        // Malformed key material — try the next accepted key.
      }
    }

    if (!signatureValid) {
      return { valid: false, error: 'Invalid license signature' };
    }

    // Check expiry
    const expiresAt = new Date(payload.expiresAt);
    const now = new Date();
    const daysRemaining = Math.ceil((expiresAt - now) / (1000 * 60 * 60 * 24));

    if (daysRemaining < -7) {
      return { valid: false, error: 'License expired', payload };
    }

    if (daysRemaining < 0) {
      // Grace period: license expired within the last 7 days. Still valid —
      // paid users stay unlocked while they renew. Callers should surface
      // `isGracePeriod` in the UI as a renewal reminder.
      return {
        valid: true,
        isExpired: true,
        isGracePeriod: true,
        payload,
        daysRemaining,
      };
    }

    return {
      valid: true,
      payload,
      isExpired: false,
      isGracePeriod: false,
      daysRemaining,
    };
  } catch (error) {
    return { valid: false, error: error.message };
  }
}

module.exports = { verifyLicenseKey, ACCEPTED_PUBLIC_KEYS };
