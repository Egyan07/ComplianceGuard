const crypto = require('crypto');

// Ed25519 public key for verifying license signatures.
// The private key is kept offline and never shipped with the app.
// Generate a keypair with: node generate-key.js --init
const PUBLIC_KEY_PEM = `-----BEGIN PUBLIC KEY-----
MCowBQYDK2VwAyEARu9Q8wPUkdj2SaTNXwD5nPHOsYBg72zt9pN9BEZmn54=
-----END PUBLIC KEY-----`;

function verifyLicenseKey(keyString) {
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

    // Verify signature
    const isValid = crypto.verify(
      null, // Ed25519 doesn't use a separate hash
      payloadBuffer,
      PUBLIC_KEY_PEM,
      signatureBuffer
    );

    if (!isValid) {
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
      return {
        valid: false,
        isExpired: true,
        isGracePeriod: true,
        error: 'License expired but within grace period',
        payload,
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

module.exports = { verifyLicenseKey };
