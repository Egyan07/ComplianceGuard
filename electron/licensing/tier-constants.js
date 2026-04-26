/**
 * Cross-repo single source of truth for versioning, machine limits, tier
 * gates, and enumerations — Electron main-process mirror.
 *
 * Mirrored verbatim on the Python side in backend/app/core/constants.py
 * and on the React side in frontend/src/constants.ts. Any edit here MUST
 * also be made in both of those files, or the desktop app will drift from
 * the backend and web frontend.
 *
 * Values are duplicated instead of imported because the three environments
 * have different module systems (Python / CommonJS / ES modules).
 *
 * Checklist for an edit:
 *   1. Update this file.
 *   2. Update backend/app/core/constants.py to match.
 *   3. Update frontend/src/constants.ts to match.
 *   4. If VERSION changed, bump package.json and frontend/package.json.
 */

const VERSION = '3.1.0';

const VALID_LICENSE_TIERS = ['free', 'pro', 'enterprise'];
const VALID_COMPLIANCE_LEVELS = ['compliant', 'at_risk', 'critical'];

const MACHINE_LIMITS = {
  free: 1,
  pro: 10,
  enterprise: null,
};

const FEATURE_GATES = {
  all_controls:        { free: false, pro: true, enterprise: true },
  per_control_scoring: { free: false, pro: true, enterprise: true },
  remediation:         { free: false, pro: true, enterprise: true },
  pdf_reports:         { free: false, pro: true, enterprise: true },
  evidence_upload:     { free: false, pro: true, enterprise: true },
  evaluation_history:  { free: false, pro: true, enterprise: true },
};

// SOC2 control IDs — desktop-specific, not mirrored in Python where controls
// are rendered from the framework metadata directly.
const FREE_TIER_CONTROL_IDS = [
  'CC1.1', 'CC2.1', 'CC3.1', 'CC4.1', 'CC5.1',
  'CC6.1', 'CC6.2', 'CC6.5',
  'CC7.1', 'CC7.2', 'CC8.1',
  'A1.1',
];

const ALL_CONTROL_IDS = [
  'CC1.1', 'CC1.2', 'CC2.1', 'CC3.1', 'CC4.1', 'CC5.1',
  'CC6.1', 'CC6.2', 'CC6.3', 'CC6.4', 'CC6.5', 'CC6.6', 'CC6.7',
  'CC7.1', 'CC7.2', 'CC8.1', 'CC9.1',
  'A1.1', 'A1.2', 'A1.3', 'A1.4',
  'C1.1', 'C1.2', 'C1.3', 'C1.4',
  'PI1.1', 'PI1.2', 'PI1.3', 'PI1.4',
];

module.exports = {
  VERSION: '3.1.0',
  VALID_LICENSE_TIERS,
  VALID_COMPLIANCE_LEVELS,
  MACHINE_LIMITS,
  FEATURE_GATES,
  FREE_TIER_CONTROL_IDS,
  ALL_CONTROL_IDS,
};
