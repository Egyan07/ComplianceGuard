/**
 * Cross-repo single source of truth for versioning, machine limits, tier
 * gates, and enumerations — React frontend mirror.
 *
 * The values live in a single shared JSON file at the repo root
 * (shared/constants.json) and are imported at build time, so the React,
 * Electron (CJS), and Python mirrors can never drift.
 *
 * TypeScript literal types are re-derived here from the JSON values so the
 * rest of the app keeps full type safety (LicenseTier, ComplianceLevel).
 */

import sharedConstants from '../../shared/constants.json';

export const VERSION: string = sharedConstants.VERSION;

export const VALID_LICENSE_TIERS = sharedConstants.VALID_LICENSE_TIERS as unknown as readonly [
  'free',
  'pro',
  'enterprise',
];
export const VALID_COMPLIANCE_LEVELS = sharedConstants.VALID_COMPLIANCE_LEVELS as unknown as readonly [
  'compliant',
  'at_risk',
  'critical',
];

export type LicenseTier = (typeof VALID_LICENSE_TIERS)[number];
export type ComplianceLevel = (typeof VALID_COMPLIANCE_LEVELS)[number];

export const MACHINE_LIMITS: Record<LicenseTier, number | null> =
  sharedConstants.MACHINE_LIMITS;

export const FEATURE_GATES: Record<string, Record<string, boolean>> =
  sharedConstants.FEATURE_GATES;
