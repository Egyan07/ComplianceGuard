/**
 * Unit tests for electron/processing/evidence-vocabulary.js.
 *
 * Covers the isKnownEvidenceType() gate used by the upload UI and the
 * desktop processManualEvidence path (Phase 11).
 */
import { describe, it, expect } from 'vitest';
import { isKnownEvidenceType, NON_SCORING_EVIDENCE_TYPES } from './evidence-vocabulary.js';

describe('isKnownEvidenceType', () => {
  // ── Canonical types ───────────────────────────────────────────────────
  it('accepts all 13 canonical evidence types', () => {
    const canonical = [
      'access_logs', 'audit_reports', 'backup_logs', 'encryption_policies',
      'event_logs', 'firewall_configs', 'incident_reports', 'network_configs',
      'policy_document', 'security_policies', 'system_configs',
      'training_records', 'user_provisioning',
    ];
    for (const t of canonical) {
      expect(isKnownEvidenceType(t)).toBe(true);
    }
  });

  // ── Legacy aliases ────────────────────────────────────────────────────
  it('accepts legacy aliases that translate to canonical types', () => {
    // These are aliases defined in evidence-vocabulary.json
    expect(isKnownEvidenceType('s3_encryption')).toBe(true);
    expect(isKnownEvidenceType('iam_policy')).toBe(true);
    expect(isKnownEvidenceType('users')).toBe(true);
    expect(isKnownEvidenceType('firewall')).toBe(true);
    expect(isKnownEvidenceType('security_settings')).toBe(true);
  });

  // ── Non-scoring storage defaults ──────────────────────────────────────
  it('accepts non-scoring storage defaults', () => {
    for (const t of NON_SCORING_EVIDENCE_TYPES) {
      expect(isKnownEvidenceType(t)).toBe(true);
    }
  });

  it('accepts manual_upload, document, text, unknown', () => {
    expect(isKnownEvidenceType('manual_upload')).toBe(true);
    expect(isKnownEvidenceType('document')).toBe(true);
    expect(isKnownEvidenceType('text')).toBe(true);
    expect(isKnownEvidenceType('unknown')).toBe(true);
  });

  // ── Dead types (should be rejected) ───────────────────────────────────
  it('rejects dead types the old upload UI exposed', () => {
    expect(isKnownEvidenceType('code_of_conduct')).toBe(false);
    expect(isKnownEvidenceType('risk_assessment')).toBe(false);
    expect(isKnownEvidenceType('vendor_assessment')).toBe(false);
    expect(isKnownEvidenceType(' penetration_test')).toBe(false);
    expect(isKnownEvidenceType('vulnerability_scan')).toBe(false);
  });

  // ── Edge cases ────────────────────────────────────────────────────────
  it('rejects empty string', () => {
    expect(isKnownEvidenceType('')).toBe(false);
  });

  it('rejects non-string inputs', () => {
    expect(isKnownEvidenceType(null)).toBe(false);
    expect(isKnownEvidenceType(undefined)).toBe(false);
    expect(isKnownEvidenceType(42)).toBe(false);
    expect(isKnownEvidenceType({})).toBe(false);
  });

  it('rejects case-mismatched strings', () => {
    expect(isKnownEvidenceType('Event_Logs')).toBe(false);
    expect(isKnownEvidenceType('EVENT_LOGS')).toBe(false);
    expect(isKnownEvidenceType('Policy_Document')).toBe(false);
  });

  it('rejects strings with leading/trailing whitespace', () => {
    expect(isKnownEvidenceType(' event_logs ')).toBe(false);
    expect(isKnownEvidenceType('\tevent_logs')).toBe(false);
  });

  it('rejects strings with injection attempts', () => {
    expect(isKnownEvidenceType('../../etc/passwd')).toBe(false);
    expect(isKnownEvidenceType('event_logs; rm -rf /')).toBe(false);
  });
});

describe('NON_SCORING_EVIDENCE_TYPES', () => {
  it('is a frozen or stable array of 4 entries', () => {
    expect(NON_SCORING_EVIDENCE_TYPES).toHaveLength(4);
    expect(NON_SCORING_EVIDENCE_TYPES).toContain('manual_upload');
    expect(NON_SCORING_EVIDENCE_TYPES).toContain('document');
    expect(NON_SCORING_EVIDENCE_TYPES).toContain('text');
    expect(NON_SCORING_EVIDENCE_TYPES).toContain('unknown');
  });
});
