'use strict';

/**
 * Anonymous install ping.
 *
 * Purpose: count installs, not downloads. A release asset download is often
 * the updater fetching latest.yml, so GitHub's download count cannot answer
 * "how many machines run this". This module sends one small payload per day.
 *
 * Policy, decided by the owner and encoded here:
 *   - ON by default in release builds, because a counter nobody opts into
 *     counts nothing. The endpoint is baked in at build time.
 *   - A one-time in-app notice on first run says it happens and how to stop it.
 *   - `CG_TELEMETRY_ENABLED=0` turns it off permanently, and that beats
 *     everything else, including the baked default.
 *   - Enterprise installations stay off: the licence tier is checked by the
 *     caller, because an enterprise customer has been sold no telemetry.
 *
 * Privacy rules, in order of importance:
 *   1. HTTPS only. A cleartext endpoint is refused, never downgraded.
 *   2. No identifiers that can be tied to a person or a machine: no username,
 *      no hostname, no serial, no MAC, no IP, no file paths. The only stable
 *      value is a random UUID generated locally on first run.
 *   3. At most one ping per interval (24h), so the payload cannot be used to
 *      infer working hours.
 *   4. A failed ping never throws and never marks state, so an offline install
 *      simply tries again later. This tool is expected to run offline.
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const ID_FILE = 'install-id.json';
const STATE_FILE = 'install-ping-state.json';
const NOTICE_FILE = 'install-ping-notice.json';
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

function _isHttps(value) {
  return typeof value === 'string' && value.startsWith('https://');
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
 * Resolve whether to report, and where.
 *
 * `baked` is the build-time default, { url, defaultEnabled }. An explicit env
 * value always wins over it, in both directions.
 *
 * Returns { enabled, endpoint, reason }.
 */
function resolveConfig(env, baked) {
  const e = env || {};
  const build = baked || {};
  const endpoint = _isHttps(e.CG_TELEMETRY_URL) ? e.CG_TELEMETRY_URL : build.url;

  if (e.CG_TELEMETRY_ENABLED === '0') return { enabled: false, endpoint, reason: 'opted-out' };
  if (!_isHttps(endpoint)) return { enabled: false, endpoint, reason: 'no-https-endpoint' };
  if (e.CG_TELEMETRY_ENABLED === '1') return { enabled: true, endpoint, reason: 'env-enabled' };
  if (build.defaultEnabled === true) return { enabled: true, endpoint, reason: 'default' };
  return { enabled: false, endpoint, reason: 'default-off' };
}

function isEnabled(env, baked) {
  return resolveConfig(env, baked).enabled;
}

/**
 * The one-time notice. Returns true the first time it is called for an
 * installation, and false forever after, so the app can say what happens
 * without nagging. Written before the notice is shown, so a crash cannot turn
 * it into a notice on every launch.
 */
function noticePending(dir) {
  const file = path.join(dir, NOTICE_FILE);
  if (_readJson(file)) return false;
  _writeJson(file, { shownAt: new Date().toISOString() });
  return true;
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
  if (typeof fetchImpl !== 'function' || !_isHttps(endpoint)) return false;

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
 * Returns {sent, reason} where reason is one of: opted-out,
 * no-https-endpoint, default-off, env-enabled, default, throttled, sent,
 * failed. Never throws.
 */
async function maybePing(options = {}) {
  const config = resolveConfig(options.env, options.baked);
  if (!config.enabled) return { sent: false, reason: config.reason };

  const dir = options.dir;
  if (!dir) return { sent: false, reason: 'no-dir' };

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
    endpoint: config.endpoint,
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
  NOTICE_FILE,
  STATE_FILE,
  buildPayload,
  getInstallId,
  isEnabled,
  maybePing,
  noticePending,
  readState,
  resolveConfig,
  send,
};
