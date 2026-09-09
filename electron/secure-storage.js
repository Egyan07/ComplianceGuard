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
 *   'fb:<base64>'   — DEPRECATED opt-in fallback (see below).
 *
 * M-1 remediation: the old automatic fallback derived an AES key from
 * username|hostname — public information, so the ciphertext protected
 * nothing beyond casual file theft while looking like "secure storage".
 * The fallback is now OPT-IN ONLY via CG_ALLOW_INSECURE_STORAGE=1, for
 * operators who explicitly accept the risk on headless Linux hosts. Without
 * that flag, encryptString refuses rather than silently downgrading a
 * credential store — callers surface a clear "reconnect in Settings" error
 * instead of pretending the value is protected.
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
    'SECURITY WARNING: Electron safeStorage is unavailable and ' +
    'CG_ALLOW_INSECURE_STORAGE=1 is set — secrets are protected ONLY by a ' +
    'machine-derived key (username|hostname, not secret material). Anyone ' +
    'with the database file can recover them. Run on a platform with an OS ' +
    'keychain to restore real protection.'
  );
}

/**
 * True when the operator explicitly opted into the insecure fallback.
 * Nothing else enables it — silently downgrading a credential store is
 * exactly the failure mode this module exists to prevent.
 */
function _fallbackAllowed() {
  return process.env.CG_ALLOW_INSECURE_STORAGE === '1';
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

  // M-1: refuse to pretend username|hostname is a secret. The insecure
  // fallback exists only behind an explicit operator opt-in.
  if (!_fallbackAllowed()) {
    throw new Error(
      'OS secure storage (keychain/DPAPI) is unavailable on this host, so ' +
      'credentials cannot be stored safely. To store them anyway with only ' +
      'obfuscation-level protection, set CG_ALLOW_INSECURE_STORAGE=1. ' +
      'Otherwise reconnect cloud sync on a host with a keychain.'
    );
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

  // Fallback path (fb:) — AES-256-GCM with machine-derived key. Decryption
  // of previously-written fb: values stays possible regardless of the opt-in
  // flag so an operator who flips the flag off can still read/disconnect.
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
