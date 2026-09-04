#!/usr/bin/env node
/**
 * Packaging security guard — ComplianceGuard.
 *
 * Fails when private signing-key material is found in the given paths. This
 * is the CI gate for CG-C1: it inspects the ACTUAL release artifacts
 * (ASAR / unpacked application trees produced by electron-builder) plus the
 * packaging inputs, not just the source layout.
 *
 * Usage:
 *   node scripts/check-package-secrets.js [path ...]
 *
 * With no arguments the guard scans, in order:
 *   - dist/ (electron-builder output) when it exists,
 *   - the packaging input set from package.json build.files:
 *     electron/**, shared/**, frontend/dist (when present).
 *
 * Detection:
 *   - filenames matching private-key patterns (.private-key.pem, *.key,
 *     *.p12, *.pfx under the scanned roots), and
 *   - file CONTENT containing an ASCII PEM private-key block
 *     (-----BEGIN *PRIVATE KEY----- / OPENSSH PRIVATE KEY / ENCRYPTED PRIVATE KEY).
 *
 * Public certificates/keys (-----BEGIN PUBLIC KEY----- etc.) are NOT flagged,
 * so legitimate verification keys embedded in code pass.
 *
 * ASAR files are scanned as raw bytes: asar stores file contents contiguously
 * and uncompressed, so a private-key block shipped inside an asar is visible
 * to a byte scan. Installer payloads are compressed (not byte-searchable);
 * the guard still scans them for matching filenames, and the unpacked app
 * tree + asar inside dist/ are the authoritative check.
 */

const fs = require('fs');
const path = require('path');

// --- Markers built from fragments so this file (which IS scanned) can never
// contain a contiguous private-key block literal that would trip itself. ---
function privateKeyBlockPatterns() {
  // Match PEM lines like "-----BEGIN [RSA|EC|ENCRYPTED] PRIVATE KEY-----",
  // "-----BEGIN OPENSSH PRIVATE KEY-----", and their END counterparts.
  const mk = (type) => new RegExp('-{5}(BEGIN|END) [A-Z0-9 ]*' + type + '-{5}');
  return [mk('PRIVATE KEY'), mk('OPENSSH PRIVATE KEY')];
}

const CONTENT_PATTERNS = privateKeyBlockPatterns();

// Name checks are anchored to the scanned root so only relevant files match.
const NAME_PATTERNS = [
  /\.private-key\.pem$/i,
  /(^|[/\\])[^/\\]*\.(?:key|p12|pfx)$/i,
  /(^|[/\\])private[-_.]?key\.(pem|der)$/i,
];

function looksPrivate(name) {
  return NAME_PATTERNS.some((re) => re.test(name));
}

// asar files store file contents contiguously and UNCOMPRESSED, so a private
// key shipped inside an asar is visible to a byte scan — but an asar can be
// far larger than any prefix cap, so whole asar files are streamed in chunks.
// Other large files (compressed installers) are not byte-searchable and only
// the first MAX_PREFIX_SCAN bytes are inspected for content markers.
const CHUNK_SIZE = 1024 * 1024;
const OVERLAP = 16 * 1024; // PEM blocks are ~40-400 bytes; 16 KB overlap is ample
const MAX_PREFIX_SCAN = 32 * 1024 * 1024;

function isAsar(p) {
  return /\.asar$/i.test(p);
}

/**
 * True when the file at `target` contains a private-key PEM block anywhere.
 * asar payloads are scanned end-to-end; other files up to MAX_PREFIX_SCAN.
 */
function fileHasPrivateBlock(target) {
  let fd = null;
  try {
    fd = fs.openSync(target, 'r');
    const size = fs.fstatSync(fd).size;
    const scanLimit = isAsar(target) ? size : Math.min(size, MAX_PREFIX_SCAN);
    if (scanLimit <= 0) return false;

    const buf = Buffer.alloc(Math.min(size, CHUNK_SIZE + OVERLAP));
    let offset = 0;
    while (offset < scanLimit) {
      const want = Math.min(buf.length, scanLimit - offset);
      const got = fs.readSync(fd, buf, 0, want, offset);
      if (got <= 0) break;
      const text = buf.toString('latin1', 0, got);
      if (CONTENT_PATTERNS.some((re) => re.test(text))) return true;
      offset += Math.max(got - OVERLAP, 1);
    }
    return false;
  } catch {
    // Unreadable file — content check skipped (filename check still applies).
    return false;
  } finally {
    if (fd !== null) {
      try { fs.closeSync(fd); } catch { /* ignore */ }
    }
  }
}

/**
 * Scan a path (file or directory). Returns a list of { path, reason }.
 */
function scanPath(target, violations, visited) {
  let stat;
  try {
    stat = fs.statSync(target);
  } catch {
    return violations;
  }

  if (stat.isDirectory()) {
    let entries;
    try {
      entries = fs.readdirSync(target, { withFileTypes: true });
    } catch {
      return violations;
    }
    for (const entry of entries) {
      scanPath(path.join(target, entry.name), violations, visited);
    }
    return violations;
  }

  const absolute = path.resolve(target);
  if (visited.has(absolute)) return violations;
  visited.add(absolute);

  const name = path.basename(target);
  const reasons = [];
  if (looksPrivate(name)) {
    reasons.push(`private-key filename: ${name}`);
  }

  if (fileHasPrivateBlock(target)) {
    reasons.push('file content contains a private-key block');
  }

  if (reasons.length > 0) {
    violations.push({ path: target, reason: reasons.join('; ') });
  }

  return violations;
}

const PACKAGING_INPUT_DIRS = ['electron', 'shared', 'frontend/dist'];
const ARTIFACT_DIR = 'dist';

function defaultTargets(root) {
  const targets = [];
  if (fs.existsSync(path.join(root, ARTIFACT_DIR))) {
    targets.push(path.join(root, ARTIFACT_DIR));
  }
  for (const dir of PACKAGING_INPUT_DIRS) {
    if (fs.existsSync(path.join(root, dir))) {
      targets.push(path.join(root, dir));
    }
  }
  return targets;
}

function checkPackageSecrets({ targets, root = process.cwd() } = {}) {
  const scanTargets = (targets && targets.length ? targets : defaultTargets(root)).map((t) =>
    path.resolve(root, t),
  );
  const violations = [];
  const visited = new Set();
  for (const target of scanTargets) {
    scanPath(target, violations, visited);
  }
  return { violations, scanned: scanTargets };
}

if (require.main === module) {
  const args = process.argv.slice(2);
  const root = process.cwd();
  const result = checkPackageSecrets({ targets: args, root });

  if (result.scanned.length === 0) {
    console.error('[check-package-secrets] No scan targets found (no dist/ and no packaging inputs).');
    process.exit(2);
  }

  console.log(`[check-package-secrets] Scanning: ${result.scanned.join(', ')}`);
  if (result.violations.length > 0) {
    for (const v of result.violations) {
      console.error(`[check-package-secrets] FAIL: ${v.path} — ${v.reason}`);
    }
    console.error(
      '[check-package-secrets] Private key material found in a packagable location. ' +
        'Move signing keys outside the repository (see electron/licensing/generate-key.js).',
    );
    process.exit(1);
  }
  console.log('[check-package-secrets] PASS: no private key material found.');
}

module.exports = { checkPackageSecrets, looksPrivate, fileHasPrivateBlock };
