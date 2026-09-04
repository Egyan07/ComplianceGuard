/**
 * Unit tests for the Electron canonical engine (electron/processing/canonical-engine.js).
 * Mirrors backend/tests/unit/test_canonical_evidence.py — the cross-engine
 * equivalence suite additionally asserts byte-identical results vs Python.
 */
import { describe, it, expect, beforeAll } from 'vitest';
import { CanonicalEngine, EvidenceVocabulary, STATUS } from './canonical-engine.js';

let engine;

beforeAll(() => {
  engine = new CanonicalEngine();
});

describe('EvidenceVocabulary (Electron)', () => {
  it('has 13 canonical types', () => {
    const vocab = EvidenceVocabulary.load();
    expect(vocab.canonicalTypes.size).toBe(13);
    expect(vocab.canonicalTypes.has('event_logs')).toBe(true);
    expect(vocab.canonicalTypes.has('system_configs')).toBe(true);
  });

  it('translates legacy aliases', () => {
    const vocab = EvidenceVocabulary.load();
    expect(vocab.translate(['users'])).toEqual(new Set(['user_provisioning']));
    expect(vocab.translate(['s3_encryption'])).toEqual(new Set(['encryption_policies']));
    expect(vocab.translate(['firewall'])).toEqual(new Set(['firewall_configs']));
  });

  it('drops non-scoring noise', () => {
    const vocab = EvidenceVocabulary.load();
    expect(vocab.translate(['manual_upload', 'document', 'text', 'unknown'])).toEqual(new Set());
  });
});

describe('CanonicalEngine (Electron)', () => {
  it('scores empty evidence as all not_assessed: overall 0 with not_assessed status (CG-M2)', () => {
    for (const fw of ['soc2', 'iso27001', 'hipaa', 'gdpr']) {
      const ev = engine.evaluate(fw, []);
      expect(Object.keys(ev.control_results).length).toBeGreaterThan(0);
      for (const r of Object.values(ev.control_results)) {
        expect(r.status).toBe(STATUS.NOT_ASSESSED);
      }
      expect(ev.overall_score).toBe(0);
      // Previously NON_COMPLIANT — nothing assessed is not the same as a
      // failed assessment.
      expect(ev.status).toBe(STATUS.NOT_ASSESSED);
    }
  });

  it('one compliant control among not_assessed stays non_compliant overall (mixed case unchanged)', () => {
    // A1.3 (SOC 2) is fully covered by system_configs. The overall average is
    // tiny, so the overall status stays NON_COMPLIANT (a real assessment gap)
    // — only the all-not-assessed case is relabelled (CG-M2). Some controls
    // share the type requirement and are partially covered; the key point is
    // that not everything is not_assessed and the overall is a real low score.
    const ev = engine.evaluate('soc2', ['system_configs']);
    expect(ev.control_results['A1.3'].status).toBe(STATUS.COMPLIANT);
    const total = Object.keys(ev.control_results).length;
    expect(ev.counts[STATUS.COMPLIANT]).toBe(1);
    expect(ev.counts[STATUS.NOT_ASSESSED]).toBeLessThan(total);
    expect(ev.status).toBe(STATUS.NON_COMPLIANT);
  });

  it('single required type fully covered is compliant', () => {
    // A1.3 (SOC 2) requires exactly system_configs.
    const ev = engine.evaluate('soc2', ['system_configs']);
    expect(ev.control_results['A1.3'].status).toBe(STATUS.COMPLIANT);
    expect(ev.control_results['A1.3'].score).toBe(100);
    expect(ev.control_results['CC1.1'].status).toBe(STATUS.NOT_ASSESSED);
  });

  it('partial coverage at 50%', () => {
    // CC7.1 requires [event_logs, system_configs].
    const ev = engine.evaluate('soc2', ['event_logs']);
    expect(ev.control_results['CC7.1'].status).toBe(STATUS.PARTIAL);
    expect(ev.control_results['CC7.1'].score).toBe(50);
    expect(ev.control_results['CC7.1'].gaps).toEqual(['system_configs']);
  });

  it('duplicates count once', () => {
    const a = engine.evaluate('soc2', ['event_logs', 'event_logs']);
    const b = engine.evaluate('soc2', ['event_logs']);
    expect(a.overall_score).toBe(b.overall_score);
  });

  it('full canonical coverage scores above 90 in every framework', () => {
    const vocab = EvidenceVocabulary.load();
    const all = [...vocab.canonicalTypes];
    for (const fw of ['soc2', 'iso27001', 'hipaa', 'gdpr']) {
      const ev = engine.evaluate(fw, all);
      expect(ev.counts[STATUS.NON_COMPLIANT]).toBe(0);
      expect(ev.overall_score).toBeGreaterThan(90);
    }
  });

  it('throws for unknown framework', () => {
    expect(() => engine.evaluate('pci_dss', [])).toThrow();
  });
});
