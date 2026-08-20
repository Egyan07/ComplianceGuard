/**
 * Unit tests for electron/processing/audit-service.js.
 *
 * Covers canonicalJson (deterministic JSON serialization) and
 * computeEntryHash (SHA-256 tamper-evident hash chain).
 */
import { describe, it, expect } from 'vitest';
import { canonicalJson, computeEntryHash } from './audit-service.js';

describe('canonicalJson', () => {
  it('returns "null" for null/undefined', () => {
    expect(canonicalJson(null)).toBe('null');
    expect(canonicalJson(undefined)).toBe('null');
  });

  it('serializes primitives directly', () => {
    expect(canonicalJson(42)).toBe('42');
    expect(canonicalJson('hello')).toBe('"hello"');
    expect(canonicalJson(true)).toBe('true');
  });

  it('serializes arrays without reordering', () => {
    expect(canonicalJson([3, 1, 2])).toBe('[3,1,2]');
  });

  it('sorts object keys alphabetically for deterministic output', () => {
    const a = canonicalJson({ z: 1, a: 2, m: 3 });
    const b = canonicalJson({ a: 2, m: 3, z: 1 });
    expect(a).toBe(b);
    expect(a).toBe('{"a":2,"m":3,"z":1}');
  });

  it('sorts top-level keys but does not recurse into nested objects', () => {
    // canonicalJson only sorts top-level keys (used for audit hash computation)
    const result = canonicalJson({ b: { z: 1, a: 2 }, a: 1 });
    expect(result).toBe('{"a":1,"b":{"z":1,"a":2}}');
  });

  it('produces different output for objects with different nested key order (top-level sorted)', () => {
    // canonicalJson sorts top-level keys but leaves nested objects unsorted
    const obj1 = { score: 90, status: 'compliant', controls: { CC1: {}, CC2: {} } };
    const obj2 = { controls: { CC2: {}, CC1: {} }, status: 'compliant', score: 90 };
    // Top-level keys are sorted in both, but nested keys differ
    expect(canonicalJson(obj1)).not.toBe(canonicalJson(obj2));
    // But top-level key order is the same
    expect(canonicalJson(obj1).slice(0, 10)).toBe(canonicalJson(obj2).slice(0, 10));
  });
});

describe('computeEntryHash', () => {
  it('produces a 64-char hex SHA-256 hash', () => {
    const hash = computeEntryHash(null, 'test_event', null, null, null, {}, '2025-01-01T00:00:00Z');
    expect(hash).toMatch(/^[a-f0-9]{64}$/);
  });

  it('returns different hashes for different event types', () => {
    const h1 = computeEntryHash(null, 'event_a', null, null, null, {}, '2025-01-01T00:00:00Z');
    const h2 = computeEntryHash(null, 'event_b', null, null, null, {}, '2025-01-01T00:00:00Z');
    expect(h1).not.toBe(h2);
  });

  it('returns different hashes for different prev_hash values', () => {
    const h1 = computeEntryHash('aaa', 'event', null, null, null, {}, '2025-01-01T00:00:00Z');
    const h2 = computeEntryHash('bbb', 'event', null, null, null, {}, '2025-01-01T00:00:00Z');
    expect(h1).not.toBe(h2);
  });

  it('returns different hashes for different scores', () => {
    const h1 = computeEntryHash(null, 'event', null, null, 80, {}, '2025-01-01T00:00:00Z');
    const h2 = computeEntryHash(null, 'event', null, null, 90, {}, '2025-01-01T00:00:00Z');
    expect(h1).not.toBe(h2);
  });

  it('returns different hashes for different created_at timestamps', () => {
    const h1 = computeEntryHash(null, 'event', null, null, null, {}, '2025-01-01T00:00:00Z');
    const h2 = computeEntryHash(null, 'event', null, null, null, {}, '2025-01-02T00:00:00Z');
    expect(h1).not.toBe(h2);
  });

  it('is deterministic — same inputs produce same hash', () => {
    const inputs = ['abc', 'login', 'user1', 'soc2', 95, { detail: 'ok' }, '2025-06-15T10:30:00Z'];
    const h1 = computeEntryHash(...inputs);
    const h2 = computeEntryHash(...inputs);
    expect(h1).toBe(h2);
  });

  it('handles null prev_hash (genesis entry)', () => {
    const hash = computeEntryHash(null, 'genesis', null, null, null, {}, '2025-01-01T00:00:00Z');
    expect(hash).toMatch(/^[a-f0-9]{64}$/);
  });

  it('handles undefined optional fields gracefully', () => {
    const hash = computeEntryHash(undefined, undefined, undefined, undefined, undefined, undefined, undefined);
    expect(hash).toMatch(/^[a-f0-9]{64}$/);
  });

  it('chains correctly — hash of entry N includes hash of entry N-1', () => {
    const ts = '2025-01-01T00:00:00Z';
    const h1 = computeEntryHash(null, 'event_a', 'u1', 'soc2', 80, { x: 1 }, ts);
    const h2 = computeEntryHash(h1, 'event_b', 'u1', 'soc2', 90, { x: 2 }, ts);
    // h2 must include h1 as prev_hash, so it should be different from h1
    expect(h2).not.toBe(h1);
    // And h2 should be deterministic given h1
    const h2Again = computeEntryHash(h1, 'event_b', 'u1', 'soc2', 90, { x: 2 }, ts);
    expect(h2).toBe(h2Again);
  });
});
