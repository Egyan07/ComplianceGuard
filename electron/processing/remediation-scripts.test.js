/**
 * Unit tests for electron/processing/remediation-scripts.js.
 *
 * Validates the static remediation map for SOC 2 controls: structure,
 * completeness, and invariants.
 */
import { describe, it, expect } from 'vitest';
import REMEDIATION_SCRIPTS from './remediation-scripts.js';

describe('REMEDIATION_SCRIPTS', () => {
  const controlIds = Object.keys(REMEDIATION_SCRIPTS);

  it('is a non-empty object', () => {
    expect(typeof REMEDIATION_SCRIPTS).toBe('object');
    expect(controlIds.length).toBeGreaterThan(0);
  });

  it('covers all 54 SOC 2 controls', () => {
    expect(controlIds.length).toBe(54);
  });

  it('every entry has a valid type (script or guide)', () => {
    for (const [id, entry] of Object.entries(REMEDIATION_SCRIPTS)) {
      expect(['script', 'guide']).toContain(entry.type);
      // Control ID as the key should match CC/A/C/PI/CA patterns
      expect(id).toMatch(/^(CC|A|C|PI|CA)\d+\.\d+$/);
    }
  });

  it('every entry has a non-empty title', () => {
    for (const [id, entry] of Object.entries(REMEDIATION_SCRIPTS)) {
      expect(typeof entry.title).toBe('string');
      expect(entry.title.length).toBeGreaterThan(0);
    }
  });

  it('every entry has required boolean fields', () => {
    for (const [id, entry] of Object.entries(REMEDIATION_SCRIPTS)) {
      expect(typeof entry.reversible).toBe('boolean');
      expect(typeof entry.requiresAdmin).toBe('boolean');
      expect(typeof entry.estimatedSeconds).toBe('number');
      expect(entry.estimatedSeconds).toBeGreaterThanOrEqual(0);
    }
  });

  it('script entries have non-empty scriptLines', () => {
    for (const [id, entry] of Object.entries(REMEDIATION_SCRIPTS)) {
      if (entry.type === 'script') {
        expect(Array.isArray(entry.scriptLines)).toBe(true);
        expect(entry.scriptLines.length).toBeGreaterThan(0);
        // Every script line should be a string
        for (const line of entry.scriptLines) {
          expect(typeof line).toBe('string');
        }
      }
    }
  });

  it('guide entries have non-empty guideSteps', () => {
    for (const [id, entry] of Object.entries(REMEDIATION_SCRIPTS)) {
      if (entry.type === 'guide') {
        expect(Array.isArray(entry.guideSteps)).toBe(true);
        expect(entry.guideSteps.length).toBeGreaterThan(0);
        for (const step of entry.guideSteps) {
          expect(typeof step).toBe('string');
          expect(step.length).toBeGreaterThan(0);
        }
      }
    }
  });

  it('script entries require admin and are reversible', () => {
    for (const [id, entry] of Object.entries(REMEDIATION_SCRIPTS)) {
      if (entry.type === 'script') {
        expect(entry.requiresAdmin).toBe(true);
        expect(entry.reversible).toBe(true);
        expect(entry.estimatedSeconds).toBeGreaterThan(0);
      }
    }
  });

  it('guide entries do not require admin and are not reversible', () => {
    for (const [id, entry] of Object.entries(REMEDIATION_SCRIPTS)) {
      if (entry.type === 'guide') {
        expect(entry.requiresAdmin).toBe(false);
        expect(entry.reversible).toBe(false);
        expect(entry.estimatedSeconds).toBe(0);
      }
    }
  });

  it('contains the 6 automatable controls', () => {
    const automatable = ['CC6.1', 'CC6.2', 'CC6.3', 'CC7.1', 'A3.2', 'A1.5'];
    for (const id of automatable) {
      expect(REMEDIATION_SCRIPTS[id]).toBeDefined();
      expect(REMEDIATION_SCRIPTS[id].type).toBe('script');
    }
  });

  it('scripts contain PowerShell remediation commands', () => {
    // CC6.1 should enable Windows Firewall
    const cc61 = REMEDIATION_SCRIPTS['CC6.1'];
    expect(cc61.scriptLines.some(l => l.includes('netsh advfirewall'))).toBe(true);

    // CC6.2 should set password policy
    const cc62 = REMEDIATION_SCRIPTS['CC6.2'];
    expect(cc62.scriptLines.some(l => l.includes('secedit') || l.includes('MinimumPasswordLength'))).toBe(true);

    // CC7.1 should configure event log
    const cc71 = REMEDIATION_SCRIPTS['CC7.1'];
    expect(cc71.scriptLines.some(l => l.includes('wevtutil'))).toBe(true);
  });

  it('no duplicate control IDs', () => {
    const unique = new Set(controlIds);
    expect(unique.size).toBe(controlIds.length);
  });
});
