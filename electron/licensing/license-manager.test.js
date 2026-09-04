const LicenseManager = require('./license-manager');
const { FEATURE_GATES } = require('./tier-constants');
const { CanonicalEngine } = require('../processing/canonical-engine');

/**
 * CG-M6 regression: a license tier gates FEATURES (per_control_scoring,
 * pdf_reports, evaluation_history, ...) — it never restricts WHICH controls
 * are evaluated. The old FREE_TIER_CONTROL_IDS restriction (claiming free
 * scored only 12 SOC 2 controls) was dead code: nothing consumed it and the
 * canonical engine always scored all controls. It is removed, and these tests
 * lock in the real contract so it cannot quietly regress.
 */

function withTier(tier) {
  const m = new LicenseManager(null);
  m.tier = tier;
  return m;
}

describe('LicenseManager evaluation coverage is tier-independent (CG-M6)', () => {
  const engine = new CanonicalEngine();

  it('every tier is scored against ALL SOC 2 controls (54), never a free subset', () => {
    for (const tier of ['free', 'pro', 'enterprise']) {
      const ev = engine.evaluate('soc2', []);
      expect(Object.keys(ev.control_results).length).toBe(54);
      expect(withTier(tier).tier).toBe(tier); // manager exists but cannot shrink coverage
    }
  });

  it('getControlIds is gone — there is no tier-restricted control list anymore', () => {
    expect(withTier('free').getControlIds).toBeUndefined();
  });
});

describe('LicenseManager feature gating (the actual tier mechanism)', () => {
  it('free gates every advanced feature, pro and enterprise unlock them', () => {
    for (const feature of ['per_control_scoring', 'pdf_reports', 'evaluation_history', 'remediation', 'evidence_upload']) {
      expect(withTier('free').isFeatureAllowed(feature)).toBe(false);
      expect(withTier('pro').isFeatureAllowed(feature)).toBe(true);
      expect(withTier('enterprise').isFeatureAllowed(feature)).toBe(true);
    }
  });

  it('enterprise-only features are locked for free and pro', () => {
    for (const feature of ['enterprise_audit_log', 'enterprise_rbac', 'enterprise_pdf_branding']) {
      expect(withTier('free').isFeatureAllowed(feature)).toBe(false);
      expect(withTier('pro').isFeatureAllowed(feature)).toBe(false);
      expect(withTier('enterprise').isFeatureAllowed(feature)).toBe(true);
    }
  });

  it('FEATURE_GATES mirror the shared constants (single source of truth)', () => {
    const shared = require('../../shared/constants.json');
    expect(FEATURE_GATES).toEqual(shared.FEATURE_GATES);
  });
});
