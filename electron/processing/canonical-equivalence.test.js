/**
 * Cross-engine equivalence suite (Phase 4).
 *
 * Scores a fixture matrix with BOTH canonical implementations and asserts
 * identical results:
 *   - Python: backend/app/core/canonical_evidence.py (run via subprocess)
 *   - Electron: electron/processing/canonical-engine.js
 *
 * Both engines read the SAME shared/frameworks data. This test is the guard
 * that prevents the two implementations from drifting — if it fails, the
 * canonical migration is not equivalent and must not ship.
 */
import { describe, it, expect, beforeAll } from 'vitest';
import { execFile } from 'child_process';
import { promisify } from 'util';
import path from 'path';

import { CanonicalEngine } from './canonical-engine.js';

const execFileP = promisify(execFile);

const FRAMEWORKS = ['soc2', 'iso27001', 'hipaa', 'gdpr'];

// Canonical + legacy vocabulary (union used in the fixture generator).
const TYPES = [
  // canonical
  'access_logs', 'audit_reports', 'backup_logs', 'encryption_policies',
  'event_logs', 'firewall_configs', 'incident_reports', 'network_configs',
  'policy_document', 'security_policies', 'system_configs', 'training_records',
  'user_provisioning',
  // legacy aliases (should translate)
  's3_encryption', 's3_public_access', 'iam_mfa', 'iam_policy',
  'security_settings', 'services', 'users', 'network', 'software',
  'file_permissions', 'system_info', 'update_status', 'firewall',
  'policy_document', 'training_records', 'incident_reports', 'audit_reports',
  // non-scoring noise that must be ignored
  'manual_upload', 'document', 'text', 'unknown',
];

function buildFixtures() {
  const fixtures = [];
  // 1. deterministic systematic coverage: all prefixes of the canonical list
  const canonical = TYPES.slice(0, 13);
  for (let i = 0; i <= canonical.length; i++) {
    fixtures.push({ name: `canonical-prefix-${i}`, types: canonical.slice(0, i) });
  }
  // 2. legacy-only subsets (translation path)
  fixtures.push({ name: 'legacy-technical', types: ['s3_encryption', 'iam_policy', 'event_logs', 'firewall', 'users', 'network', 'system_info'] });
  fixtures.push({ name: 'legacy-docs', types: ['policy_document', 'security_policies', 'training_records', 'incident_reports', 'audit_reports'] });
  fixtures.push({ name: 'legacy-full', types: TYPES.filter((t, i) => i >= 13 && i <= 29) });
  // 3. noise only
  fixtures.push({ name: 'noise-only', types: ['manual_upload', 'document', 'text', 'unknown'] });
  fixtures.push({ name: 'empty', types: [] });
  // 4. single types (one fixture per canonical type)
  for (const t of canonical) {
    fixtures.push({ name: `single-${t}`, types: [t] });
  }
  // 5. pseudo-random deterministic subsets (seeded)
  let seed = 42;
  const rand = () => {
    seed = (seed * 1103515245 + 12345) & 0x7fffffff;
    return seed / 0x7fffffff;
  };
  for (let i = 0; i < 30; i++) {
    const k = 1 + Math.floor(rand() * TYPES.length);
    const subset = [...new Set(Array.from({ length: k }, () => TYPES[Math.floor(rand() * TYPES.length)]))];
    fixtures.push({ name: `random-${i}`, types: subset });
  }
  return fixtures;
}

let pythonResults = null;
let pythonStderr = '';

beforeAll(async () => {
  // Run the Python canonical engine over the full fixture matrix in one subprocess.
  const pythonBin = process.env.PYTHON || 'python';
  const script = path.join(__dirname, '..', '..', 'backend', 'scripts', 'canonical_batch.py');
  const fixtures = buildFixtures();
  const fixtureMap = Object.fromEntries(fixtures.map((f) => [f.name, f.types]));
  try {
    const { stdout, stderr } = await execFileP(pythonBin, [script, JSON.stringify(fixtureMap)], {
      cwd: path.join(__dirname, '..', '..'),
      maxBuffer: 64 * 1024 * 1024,
      env: { ...process.env, PYTHONIOENCODING: 'utf-8' },
    });
    pythonResults = JSON.parse(stdout);
    pythonStderr = stderr || '';
  } catch (err) {
    pythonStderr = String(err.stderr || err.message || err);
    throw new Error(`Python canonical engine subprocess failed: ${pythonStderr}`);
  }
});

describe('canonical cross-engine equivalence (Python vs Electron)', () => {
  const fixtures = buildFixtures();
  const engine = new CanonicalEngine();

  it(`runs ${fixtures.length} fixtures x ${FRAMEWORKS.length} frameworks through both engines`, () => {
    expect(pythonResults).toBeTruthy();
    expect(Object.keys(pythonResults).length).toBe(fixtures.length);
  });

  for (const fw of FRAMEWORKS) {
    for (const fx of fixtures) {
      it(`[${fw}] ${fx.name} — identical overall/status/counts/per-control`, () => {
        const py = pythonResults[fx.name][fw];
        const js = engine.evaluate(fw, fx.types);

        expect(py.overall_score).toBeCloseTo(js.overall_score, 6);
        expect(py.status).toBe(js.status);
        expect(py.counts).toEqual(js.counts);

        const pyControls = Object.keys(py.control_results).length;
        const jsControls = Object.keys(js.control_results).length;
        expect(pyControls).toBe(jsControls);

        for (const [cid, jsResult] of Object.entries(js.control_results)) {
          const pyResult = py.control_results[cid];
          expect(pyResult).toBeTruthy();
          expect(pyResult.score).toBe(jsResult.score);
          expect(pyResult.status).toBe(jsResult.status);
          expect(pyResult.available_evidence).toEqual(jsResult.available_evidence);
          expect(pyResult.gaps).toEqual(jsResult.gaps);
        }

        for (const [cat, jsCat] of Object.entries(js.category_scores)) {
          const pyCat = py.category_scores[cat];
          expect(pyCat).toBeTruthy();
          expect(pyCat.score).toBeCloseTo(jsCat.score, 6);
        }
      });
    }
  }
});
