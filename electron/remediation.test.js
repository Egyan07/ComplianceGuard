import { describe, it, expect } from 'vitest';
import REMEDIATION_SCRIPTS from './processing/remediation-scripts.js';

// Real 2017 TSC criteria with automatable PowerShell scripts — must match the
// 'script' entries in remediation-scripts.js and AUTOMATABLE_CONTROLS in
// frontend/src/components/ControlHeatmap.tsx.
const AUTOMATABLE = ['CC6.1', 'CC6.2', 'CC6.6', 'CC6.8', 'CC7.1', 'CC7.2'];

describe('remediation-scripts', () => {
  it('has entries for all 43 real SOC 2 TSC criteria', () => {
    expect(Object.keys(REMEDIATION_SCRIPTS).length).toBe(43);
  });

  it('all automatable controls have non-empty scriptLines', () => {
    for (const id of AUTOMATABLE) {
      expect(REMEDIATION_SCRIPTS[id].scriptLines.length).toBeGreaterThan(0);
    }
  });

  it('all automatable controls are reversible and requireAdmin', () => {
    for (const id of AUTOMATABLE) {
      expect(REMEDIATION_SCRIPTS[id].reversible).toBe(true);
      expect(REMEDIATION_SCRIPTS[id].requiresAdmin).toBe(true);
    }
  });

  it('all guidance controls have non-empty guideSteps', () => {
    const guidance = Object.entries(REMEDIATION_SCRIPTS).filter(([, v]) => v.type === 'guide');
    for (const [, entry] of guidance) {
      expect(entry.guideSteps.length).toBeGreaterThan(0);
    }
  });

  it('CC7.2 is the audit-policy script (anomaly monitoring evidence)', () => {
    expect(REMEDIATION_SCRIPTS['CC7.2'].type).toBe('script');
    expect(REMEDIATION_SCRIPTS['CC7.2'].title).toContain('Audit Policy');
  });

  it('CC6.3 (access authorization) is guidance, not a script', () => {
    // The real CC6.3 is authorization/least-privilege — an organizational
    // control that endpoint scripts cannot remediate.
    expect(REMEDIATION_SCRIPTS['CC6.3'].type).toBe('guide');
  });

  it('contains no fabricated control IDs', () => {
    // These IDs do not exist in the 2017 Trust Services Criteria.
    for (const fabricated of ['A3.2', 'A1.4', 'A1.5', 'A2.1', 'A3.1', 'C3.2', 'PI2.1', 'PI3.2']) {
      expect(REMEDIATION_SCRIPTS[fabricated]).toBeUndefined();
    }
    for (const id of Object.keys(REMEDIATION_SCRIPTS)) {
      expect(id.startsWith('CA')).toBe(false);
    }
  });

  it('CC6.6 external-threat script blocks insecure inbound ports', () => {
    const entry = REMEDIATION_SCRIPTS['CC6.6'];
    expect(entry.type).toBe('script');
    expect(entry.scriptLines.some(l => l.includes('localport=23'))).toBe(true);
    expect(entry.scriptLines.some(l => l.includes('localport=21'))).toBe(true);
  });
});
