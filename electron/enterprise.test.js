import { describe, it, expect, beforeEach } from 'vitest';
import { canonicalJson, computeEntryHash, logAuditEvent } from './processing/audit-service.js';
import Database from 'better-sqlite3';

function makeDb() {
  const db = new Database(':memory:');
  db.exec(`
    CREATE TABLE enterprise_audit_log (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      event_type TEXT NOT NULL,
      user_id INTEGER,
      framework TEXT,
      score REAL,
      detail_json TEXT,
      prev_hash TEXT,
      entry_hash TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    )
  `);
  return db;
}

describe('canonicalJson', () => {
  it('sorts keys', () => {
    expect(canonicalJson({ z: 1, a: 2 })).toBe('{"a":2,"z":1}');
  });

  it('is deterministic', () => {
    expect(canonicalJson({ b: 1, a: 2 })).toBe(canonicalJson({ a: 2, b: 1 }));
  });
});

describe('computeEntryHash', () => {
  it('returns 64 char hex string', () => {
    const h = computeEntryHash(null, 'evaluation_run', null, 'soc2', 0.9, {}, '2026-05-17T00:00:00.000Z');
    expect(h).toHaveLength(64);
  });

  it('changes when score changes', () => {
    const h1 = computeEntryHash(null, 'evaluation_run', null, 'soc2', 0.9, {}, '2026-05-17T00:00:00.000Z');
    const h2 = computeEntryHash(null, 'evaluation_run', null, 'soc2', 0.5, {}, '2026-05-17T00:00:00.000Z');
    expect(h1).not.toBe(h2);
  });

  it('matches Python canonical JSON output for same input', () => {
    // Python: canonical_json({"a": 1, "b": 2}) = '{"a":1,"b":2}'
    expect(canonicalJson({ b: 2, a: 1 })).toBe('{"a":1,"b":2}');
  });
});

describe('logAuditEvent', () => {
  let db;
  beforeEach(() => { db = makeDb(); });

  it('inserts a row', () => {
    logAuditEvent(db, 'evaluation_run', { framework: 'soc2', score: 0.8, detail: {} });
    const rows = db.prepare('SELECT * FROM enterprise_audit_log').all();
    expect(rows).toHaveLength(1);
    expect(rows[0].event_type).toBe('evaluation_run');
  });

  it('chains prev_hash correctly', () => {
    logAuditEvent(db, 'evaluation_run', { framework: 'soc2', score: 0.8, detail: {} });
    logAuditEvent(db, 'evidence_collected', { framework: 'soc2', detail: {} });
    const rows = db.prepare('SELECT * FROM enterprise_audit_log ORDER BY id').all();
    expect(rows[1].prev_hash).toBe(rows[0].entry_hash);
  });

  it('first row has null prev_hash', () => {
    logAuditEvent(db, 'evaluation_run', { framework: 'soc2', score: 0.8, detail: {} });
    const row = db.prepare('SELECT * FROM enterprise_audit_log').get();
    expect(row.prev_hash).toBeNull();
  });

  it('entry_hash is reproducible from stored fields', () => {
    logAuditEvent(db, 'evaluation_run', { framework: 'soc2', score: 0.8, detail: { x: 1 } });
    const row = db.prepare('SELECT * FROM enterprise_audit_log').get();
    const detail = JSON.parse(row.detail_json);
    const recomputed = computeEntryHash(row.prev_hash, row.event_type, row.user_id, row.framework, row.score, detail, row.created_at);
    expect(recomputed).toBe(row.entry_hash);
  });
});
