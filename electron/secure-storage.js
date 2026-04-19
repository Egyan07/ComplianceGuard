const log = require('./logger');
/**
 * Secure storage helpers using Electron's safeStorage API.
 *
 * safeStorage uses the OS keychain / DPAPI under the hood, so it requires the
 * Electron app to be ready before any encrypt/decrypt call is made.
 * Never call these functions at module-load time; always call them from within
 * an async function that runs after app.whenReady().
 *
 * Stored format: 'enc:<base64>'  — allows transparent migration of legacy
 * plaintext values already in SQLite (they are returned as-is on read until
 * the next write overwrites them with the encrypted form).
 *
 * On platforms where encryption is unavailable (e.g. headless Linux CI),
 * values are stored as plaintext and a warning is logged.
 */

function isAvailable() {
  const { safeStorage } = require('electron');
  return safeStorage.isEncryptionAvailable();
}

function encryptString(plaintext) {
  if (!plaintext) return '';
  const { safeStorage } = require('electron');
  if (!isAvailable()) {
    log.warn('safeStorage: encryption unavailable, storing plaintext');
    return plaintext;
  }
  return 'enc:' + safeStorage.encryptString(plaintext).toString('base64');
}

function decryptString(stored) {
  if (!stored) return '';
  if (!stored.startsWith('enc:')) return stored; // migration: legacy plaintext
  const { safeStorage } = require('electron');
  if (!isAvailable()) return '';
  try {
    const buf = Buffer.from(stored.slice(4), 'base64');
    return safeStorage.decryptString(buf);
  } catch {
    return '';
  }
}

module.exports = { isAvailable, encryptString, decryptString };
