'use strict';

/**
 * Anonymous install ping.
 *
 * Purpose: count installs, not downloads. A release asset download is often
 * the updater fetching latest.yml, so GitHub's download count cannot answer
 * "how many people run this". This module sends one small payload from a
 * machine that has explicitly opted in.
 *
 * Privacy rules this module is built around, in order of importance:
 *   1. OFF unless CG_TELEMETRY_ENABLED=1. Nothing phones home by default. A
 *      compliance tool that reports on its users without asking is not one.
 *   2. HTTPS only. A cleartext endpoint is refused rather than downgraded.
 *   3. No identifiers that can be tied to a person or a machine: no username,
 *      no hostname, no serial, no MAC, no IP, no file paths. The only stable
 *      value is a random UUID generated locally on first run.
 *   4. At most one ping per interval (24h), so the payload cannot be used to
 *      infer working hours.
 *   5. A failed ping never throws and never marks state, so an offline install
 *      simply tries again later. This tool is expected to run offline.
 *
 * The endpoint is a counter, not an analytics platform. Send it to something
 * that stores {installId, appVersion, platform, arch, firstPing} and nothing
 * else.
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const ID_FILE = 'install-id.json';
const STATE_FILE = 'install-ping-state.json';
const DEFAULT_INTERVAL_MS = 24 * 60 * 60 * 1000;
const DEFAULT_TIMEOUT_MS = 5000;

function _readJson(file) {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch {
    return null;
  }
}

function _writeJson(file, value) {
  try {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, JSON.stringify(value), { mode: 0o600 });
    return true;
  } catch {
    return false;
  }
}

/**
 * Stable random identifier for this installation. Created once, then reused,
 * so a machine running for a year still counts as one install. Not derived
 * from anything about the machine — it is a UUID and nothing else.
 */
function getInstallId(dir) {
  const file = path.join(dir, ID_FILE);
  const existing = _readJson(file);
  if (existing && typeof existing.installId === 'string' && existing.installId.length >= 32) {
    return existing.installId;
  }
  const installId = crypto.randomUUID();
  _writeJson(file, { installId, createdAt: new Date().toISOString() });
  return installId;
}

function readState(dir) {
  const state = _readJson(path.join(dir, STATE_FILE));
  if (!state || typeof state !== 'object') return { lastPingAt: 0, count: 0 };
  return {
    lastPingAt: Number(state.lastPingAt) || 0,
    count: Number(state.count) || 0,
  };
}

function writeState(dir, state) {
  return _writeJson(path.join(dir, STATE_FILE), state);
}

/**
 * Opt-in gate. Both a flag and an https endpoint are required; a flag alone
 * with no endpoint is a misconfiguration, not permission to send anywhere.
 */
function isEnabled(env) {
  const e = env || process.env || {};
  if (e.CG_TELEMETRY_ENABLED !== '1') return false;
  const url = e.CG_TELEMETRY_URL;
  return typeof url === 'string' && url.startsWith('https://');
}

function buildPayload({ installId, appVersion, platform, arch, firstPing }) {
  return {
    installId,
    appVersion,
    platform,
    arch,
    firstPing: firstPing === true,
  };
}

/**
 * POST the payload. Returns true only on a 2xx. Swallows everything else:
 * the caller is app startup and must never be blocked by telemetry.
 */
async function send(payload, options = {}) {
  const endpoint = options.endpoint;
  const fetchImpl = options.fetchImpl || globalThis.fetch;
  const timeoutMs = options.timeoutMs || DEFAULT_TIMEOUT_MS;
  if (typeof fetchImpl !== 'function') return false;

  const controller = typeof AbortController === 'function' ? new AbortController() : null;
  const timer = controller ? setTimeout(() => controller.abort(), timeoutMs) : null;
  try {
    const res = await fetchImpl(endpoint, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(payload),
      signal: controller ? controller.signal : undefined,
    });
    return Boolean(res && res.ok);
  } catch {
    return false;
  } finally {
    if (timer) clearTimeout(timer);
  }
}

/**
 * Send a ping if enabled, not throttled, and the send succeeds.
 *
 * Returns {sent, reason} where reason is one of: disabled, throttled, sent,
 * failed. Never throws.
 */
async function maybePing(options = {}) {
  const env = options.env || process.env;
  if (!isEnabled(env)) return { sent: false, reason: 'disabled' };

  const dir = options.dir;
  if (!dir) return { sent: false, reason: 'disabled' };

  const now = options.now ? options.now() : Date.now();
  const intervalMs = options.intervalMs || DEFAULT_INTERVAL_MS;
  const state = readState(dir);
  if (state.lastPingAt && now - state.lastPingAt < intervalMs) {
    return { sent: false, reason: 'throttled' };
  }

  const payload = buildPayload({
    installId: getInstallId(dir),
    appVersion: options.appVersion || 'unknown',
    platform: options.platform || process.platform,
    arch: options.arch || process.arch,
    firstPing: state.count === 0,
  });

  const ok = await send(payload, {
    endpoint: env.CG_TELEMETRY_URL,
    fetchImpl: options.fetchImpl,
    timeoutMs: options.timeoutMs,
  });

  if (!ok) return { sent: false, reason: 'failed' };

  writeState(dir, { lastPingAt: now, count: state.count + 1 });
  return { sent: true, reason: 'sent' };
}

module.exports = {
  DEFAULT_INTERVAL_MS,
  ID_FILE,
  STATE_FILE,
  buildPayload,
  getInstallId,
  isEnabled,
  maybePing,
  readState,
  send,
};
