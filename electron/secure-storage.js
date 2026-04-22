const log = require('./logger');
const crypto = require('crypto');
const os = require('os');

/**
 * Secure storage helpers using Electron's safeStorage API.
 *
 * safeStorage uses the OS keychain / DPAPI under the hood, so it requires
 * the Electron app to be ready before any encrypt/decrypt call is made.
 * Never call these at module-load time; always from within an async function
 * that runs after app.whenReady().
 *
 * Stored formats:
 *   'enc:<base64>'  — real encryption via OS-level safeStorage
 *   'fb:<base64>'   — fallback AES-256-GCM using a machine-derived key.
 *                     NOT equivalent to OS encryption — an attacker with the
 *                     SQLite file AND the host still gets the plaintext —
 *                     but is meaningfully better than literal plaintext in
 *                     headless environments where safeStorage is unavailable.
 *
 * Legacy plaintext values (no prefix) are returned as-is on read, so we
 * migrate transparently the next time they're written.
 */

// Stable, process-wide marker so we only log the fallback warning once even
// if encryptString/decryptString are called dozens of times.
let _fallbackWarned = false;

const FALLBACK_PREFIX = 'fb:';
const SAFE_PREFIX = 'enc:';
const FALLBACK_INFO = 'complianceguard:secure-storage-fallback:v1';

function _warnFallbackOnce() {
  if (_fallbackWarned) return;
  _fallbackWarned = true;
  log.warn(
    'SECURITY WARNING: Electron safeStorage is unavailable on this host. ' +
    'Secure-storage values are being protected with a machine-derived key ' +
    'fallback only — an attacker with local filesystem access can recover ' +
    'them. Run this app on a platform with an OS keychain (macOS Keychain, ' +
    'Windows DPAPI, or libsecret on Linux) to restore full protection.'
  );
}

function _fallbackKey() {
  // Derive a 32-byte key from a machine-specific string. The material is NOT
  // secret (anyone with shell access can read it) — this is purely defense
  // in depth against casual DB-file theft.
  const material = `${os.userInfo().username}|${os.hostname()}|${FALLBACK_INFO}`;
  return crypto.createHash('sha256').update(material).digest();
}

function isAvailable() {
  try {
    const { safeStorage } = require('electron');
    return safeStorage.isEncryptionAvailable();
  } catch {
    return false;
  }
}

function encryptString(plaintext) {
  if (!plaintext) return '';
  if (isAvailable()) {
    const { safeStorage } = require('electron');
    return SAFE_PREFIX + safeStorage.encryptString(plaintext).toString('base64');
  }

  _warnFallbackOnce();
  const key = _fallbackKey();
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const ct = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const authTag = cipher.getAuthTag();
  // layout: [12 iv][16 tag][ct]
  const blob = Buffer.concat([iv, authTag, ct]).toString('base64');
  return FALLBACK_PREFIX + blob;
}

function decryptString(stored) {
  if (!stored) return '';

  // Legacy plaintext — migrate on next write. Callers that require encryption
  // should re-encryptString() the returned value before using it further.
  if (!stored.startsWith(SAFE_PREFIX) && !stored.startsWith(FALLBACK_PREFIX)) {
    return stored;
  }

  if (stored.startsWith(SAFE_PREFIX)) {
    if (!isAvailable()) {
      throw new Error(
        'Cannot decrypt: value was encrypted with OS safeStorage but that ' +
        'API is no longer available on this host. Reconnect in Settings.'
      );
    }
    try {
      const { safeStorage } = require('electron');
      const buf = Buffer.from(stored.slice(SAFE_PREFIX.length), 'base64');
      return safeStorage.decryptString(buf);
    } catch (err) {
      throw new Error(`safeStorage decryptString failed: ${err.message}`);
    }
  }

  // Fallback path (fb:) — AES-256-GCM with machine-derived key.
  _warnFallbackOnce();
  try {
    const blob = Buffer.from(stored.slice(FALLBACK_PREFIX.length), 'base64');
    if (blob.length < 12 + 16 + 1) {
      throw new Error('ciphertext too short');
    }
    const iv = blob.subarray(0, 12);
    const authTag = blob.subarray(12, 28);
    const ct = blob.subarray(28);
    const decipher = crypto.createDecipheriv('aes-256-gcm', _fallbackKey(), iv);
    decipher.setAuthTag(authTag);
    const pt = Buffer.concat([decipher.update(ct), decipher.final()]);
    return pt.toString('utf8');
  } catch (err) {
    throw new Error(`Fallback decryptString failed: ${err.message}`);
  }
}

module.exports = { isAvailable, encryptString, decryptString };
