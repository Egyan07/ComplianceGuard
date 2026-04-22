/**
 * Cross-repo single source of truth for versioning, machine limits, tier
 * gates, and enumerations — React frontend mirror.
 *
 * Mirrored verbatim on the Python side in backend/app/core/constants.py
 * and in the desktop main process at electron/licensing/tier-constants.js.
 * Any edit here MUST also be made in both of those files or the frontend
 * will drift from the backend and the Electron app.
 *
 * Values are duplicated instead of imported because the three environments
 * have different module systems (Python / CommonJS / ES modules) and we
 * don't want the bundler to depend on a JSON shim.
 *
 * Checklist for an edit:
 *   1. Update this file.
 *   2. Update backend/app/core/constants.py to match.
 *   3. Update electron/licensing/tier-constants.js to match.
 *   4. If VERSION changed, bump:
 *       - package.json (repo root)
 *       - frontend/package.json
 */

export const VERSION = '3.0.0';

export const VALID_LICENSE_TIERS = ['free', 'pro', 'enterprise'] as const;
export const VALID_COMPLIANCE_LEVELS = ['compliant', 'at_risk', 'critical'] as const;

export type LicenseTier = typeof VALID_LICENSE_TIERS[number];
export type ComplianceLevel = typeof VALID_COMPLIANCE_LEVELS[number];

export const MACHINE_LIMITS: Record<LicenseTier, number | null> = {
  free: 1,
  pro: 10,
  enterprise: null,
};

export const FEATURE_GATES: Record<string, Record<string, boolean>> = {
  all_controls:        { free: false, pro: true, enterprise: true },
  per_control_scoring: { free: false, pro: true, enterprise: true },
  remediation:         { free: false, pro: true, enterprise: true },
  pdf_reports:         { free: false, pro: true, enterprise: true },
  evidence_upload:     { free: false, pro: true, enterprise: true },
  evaluation_history:  { free: false, pro: true, enterprise: true },
};
