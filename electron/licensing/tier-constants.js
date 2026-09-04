/**
 * Cross-repo single source of truth for versioning, machine limits, tier
 * gates, and enumerations — Electron main-process mirror.
 *
 * The values live in a single shared JSON file at the repo root
 * (shared/constants.json) and are loaded at require time, so the Electron,
 * React (ESM), and Python mirrors can never drift.
 *
 */

const path = require('path');
const SHARED = require(path.join(__dirname, '..', '..', 'shared', 'constants.json'));

const VERSION = SHARED.VERSION;

const VALID_LICENSE_TIERS = SHARED.VALID_LICENSE_TIERS;
const VALID_COMPLIANCE_LEVELS = SHARED.VALID_COMPLIANCE_LEVELS;

const MACHINE_LIMITS = SHARED.MACHINE_LIMITS;

const FEATURE_GATES = SHARED.FEATURE_GATES;

// CG-M6: the old FREE_TIER_CONTROL_IDS / ALL_CONTROL_IDS lists (and
// LicenseManager.getControlIds) were REMOVED. They claimed free tier only
// scored 12 SOC 2 controls, but nothing ever consulted them — the canonical
// engine (electron/processing/canonical-engine.js + backend
// app/core/canonical_evidence.py) scores ALL framework controls for every
// tier, and tiering works through FEATURE_GATES (per_control_scoring,
// pdf_reports, evaluation_history, ...). Duplicating the control list here
// would drift from the framework YAML again.

module.exports = {
  VERSION,
  VALID_LICENSE_TIERS,
  VALID_COMPLIANCE_LEVELS,
  MACHINE_LIMITS,
  FEATURE_GATES,
};
