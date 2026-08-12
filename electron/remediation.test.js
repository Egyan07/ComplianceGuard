import { describe, it, expect } from 'vitest';
import REMEDIATION_SCRIPTS from './processing/remediation-scripts.js';

const AUTOMATABLE = ['CC6.1','CC6.2','CC6.3','CC7.1','A3.2','A1.5'];

describe('remediation-scripts', () => {
  it('has entries for all 54 SOC 2 controls', () => {
    expect(Object.keys(REMEDIATION_SCRIPTS).length).toBe(54);
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

  it('CC6.3 is type script with Audit Policy in title', () => {
    expect(REMEDIATION_SCRIPTS['CC6.3'].type).toBe('script');
    expect(REMEDIATION_SCRIPTS['CC6.3'].title).toContain('Audit Policy');
  });
});
