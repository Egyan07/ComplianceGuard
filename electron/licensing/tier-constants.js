/**
 * Cross-repo single source of truth for versioning, machine limits, tier
 * gates, and enumerations — Electron main-process mirror.
 *
 * The values live in a single shared JSON file at the repo root
 * (shared/constants.json) and are loaded at require time, so the Electron,
 * React (ESM), and Python mirrors can never drift.
 *
 * Desktop-specific lists that are NOT mirrored anywhere else stay here:
 *   - FREE_TIER_CONTROL_IDS — keep in sync with backend/app/core/soc2_controls.yaml
 *   - ALL_CONTROL_IDS       — keep in sync with backend/app/core/soc2_controls.yaml
 */

const path = require('path');
const SHARED = require(path.join(__dirname, '..', '..', 'shared', 'constants.json'));

const VERSION = SHARED.VERSION;

const VALID_LICENSE_TIERS = SHARED.VALID_LICENSE_TIERS;
const VALID_COMPLIANCE_LEVELS = SHARED.VALID_COMPLIANCE_LEVELS;

const MACHINE_LIMITS = SHARED.MACHINE_LIMITS;

const FEATURE_GATES = SHARED.FEATURE_GATES;

// SOC2 control IDs — desktop-specific, not mirrored in Python where controls
// are rendered from the framework metadata directly.
// Keep ALL_CONTROL_IDS in sync with backend/app/core/soc2_controls.yaml.
const FREE_TIER_CONTROL_IDS = [
  'CC1.1', 'CC2.1', 'CC3.1', 'CC4.1', 'CC5.1',
  'CC6.1', 'CC6.2', 'CC6.3',
  'CC7.1', 'CC8.1', 'CC9.1',
  'A1.1',
];

const ALL_CONTROL_IDS = [
  // Common Criteria (CC) — 19
  'CC1.1', 'CC1.2', 'CC1.3',
  'CC2.1', 'CC2.2', 'CC2.3',
  'CC3.1', 'CC3.2', 'CC3.3',
  'CC4.1', 'CC4.2',
  'CC5.1', 'CC5.2',
  'CC6.1', 'CC6.2', 'CC6.3',
  'CC7.1', 'CC8.1', 'CC9.1',
  // Availability (A) — 9
  'A1.1', 'A1.2', 'A1.3', 'A1.4', 'A1.5',
  'A2.1', 'A2.2',
  'A3.1', 'A3.2',
  // Confidentiality (C) — 9
  'C1.1', 'C1.2', 'C1.3', 'C1.4',
  'C2.1', 'C2.2', 'C2.3',
  'C3.1', 'C3.2',
  // Processing Integrity (PI) — 9
  'PI1.1', 'PI1.2', 'PI1.3', 'PI1.4', 'PI1.5',
  'PI2.1', 'PI2.2',
  'PI3.1', 'PI3.2',
  // Confidentiality & Availability (CA) — 8
  'CA1.1', 'CA1.2', 'CA1.3', 'CA1.4', 'CA1.5', 'CA1.6', 'CA1.7', 'CA1.8',
];

module.exports = {
  VERSION,
  VALID_LICENSE_TIERS,
  VALID_COMPLIANCE_LEVELS,
  MACHINE_LIMITS,
  FEATURE_GATES,
  FREE_TIER_CONTROL_IDS,
  ALL_CONTROL_IDS,
};
