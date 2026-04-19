const log = require('../logger');
const { verifyLicenseKey } = require('./license-crypto');
const { FREE_TIER_CONTROL_IDS, ALL_CONTROL_IDS, FEATURE_GATES } = require('./tier-constants');
const secureStorage = require('../secure-storage');

class LicenseManager {
  constructor(database) {
    this.db = database;
    this.tier = 'free';
    this.licensePayload = null;
    this.validationResult = null;
  }

  async initialize() {
    try {
      const storedRaw = await this.db.getUserSetting('license_key', null);
      const storedKey = storedRaw ? secureStorage.decryptString(storedRaw) : null;
      if (storedKey) {
        const result = verifyLicenseKey(storedKey);
        if (result.valid) {
          this.tier = result.payload.tier || 'pro';
          this.licensePayload = result.payload;
          this.validationResult = result;
        } else {
          // Stored key is invalid/expired — stay on free
          this.tier = 'free';
          this.licensePayload = null;
        }
      }
    } catch (error) {
      log.error('License initialization error:', error);
      this.tier = 'free';
    }
  }

  async activateLicense(keyString) {
    const result = verifyLicenseKey(keyString);

    if (!result.valid) {
      return { valid: false, error: result.error };
    }

    // Store the key encrypted
    await this.db.setUserSetting('license_key', secureStorage.encryptString(keyString), 'string');

    this.tier = result.payload.tier || 'pro';
    this.licensePayload = result.payload;
    this.validationResult = result;

    return {
      valid: true,
      tier: this.tier,
      payload: this.getSafeLicenseInfo(),
    };
  }

  async deactivateLicense() {
    await this.db.setUserSetting('license_key', '', 'string'); // empty string — no encryption needed
    this.tier = 'free';
    this.licensePayload = null;
    this.validationResult = null;
  }

  getTier() {
    return this.tier;
  }

  getControlIds() {
    return this.tier === 'pro' ? ALL_CONTROL_IDS : FREE_TIER_CONTROL_IDS;
  }

  isFeatureAllowed(featureName) {
    const gate = FEATURE_GATES[featureName];
    if (!gate) return true; // ungated feature
    return gate[this.tier] === true;
  }

  getLicenseInfo() {
    return {
      tier: this.tier,
      ...this.getSafeLicenseInfo(),
    };
  }

  getSafeLicenseInfo() {
    if (!this.licensePayload) {
      return {
        licenseId: null,
        email: null,
        maxMachines: 1,
        expiresAt: null,
        daysRemaining: null,
        isExpired: false,
        isGracePeriod: false,
      };
    }

    return {
      licenseId: this.licensePayload.licenseId,
      email: this.licensePayload.email,
      maxMachines: this.licensePayload.maxMachines || 10,
      expiresAt: this.licensePayload.expiresAt,
      daysRemaining: this.validationResult?.daysRemaining ?? null,
      isExpired: this.validationResult?.isExpired ?? false,
      isGracePeriod: this.validationResult?.isGracePeriod ?? false,
    };
  }
}

module.exports = LicenseManager;
