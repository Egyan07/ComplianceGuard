const LicenseManager = require('./license-manager');
const { ALL_CONTROL_IDS, FREE_TIER_CONTROL_IDS } = require('./tier-constants');

// getControlIds() decides which SOC 2 controls an evaluation scores.
// Paid tiers (pro AND enterprise) get the full set; only free is restricted.
describe('LicenseManager.getControlIds', () => {
  function withTier(tier) {
    const m = new LicenseManager(null);
    m.tier = tier;
    return m;
  }

  it('free tier → free controls only', () => {
    expect(withTier('free').getControlIds()).toEqual(FREE_TIER_CONTROL_IDS);
  });

  it('pro tier → all controls', () => {
    expect(withTier('pro').getControlIds()).toEqual(ALL_CONTROL_IDS);
  });

  it('enterprise tier → all controls (not the free subset)', () => {
    expect(withTier('enterprise').getControlIds()).toEqual(ALL_CONTROL_IDS);
  });
});
