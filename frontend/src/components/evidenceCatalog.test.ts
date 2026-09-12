import { describe, expect, it } from 'vitest';
import {
  CANONICAL_EVIDENCE_TYPES,
  GDPR_CONTROLS,
  getCategoryForType,
  HIPAA_CONTROLS,
  ISO27001_CONTROLS,
  SOC2_CONTROLS,
} from './evidenceCatalog.generated';

describe('evidence catalog (generated from canonical shared data)', () => {
  it('covers all 43 SOC 2 criteria (2017 TSC) with non-empty type lists', () => {
    expect(SOC2_CONTROLS.length).toBe(43);
    for (const control of SOC2_CONTROLS) {
      expect(control.types.length).toBeGreaterThan(0);
    }
  });

  it('covers every canonical framework with the exact taxonomy counts', () => {
    // Locked to the canonical taxonomies: SOC 2 2017 TSC (43), ISO/IEC
    // 27001:2022 Annex A (93), HIPAA Security Rule (47), GDPR (38).
    expect(SOC2_CONTROLS.length).toBe(43);
    expect(ISO27001_CONTROLS.length).toBe(93);
    expect(HIPAA_CONTROLS.length).toBe(47);
    expect(GDPR_CONTROLS.length).toBe(38);
  });

  it('has unique control ids within each framework', () => {
    for (const controls of [SOC2_CONTROLS, ISO27001_CONTROLS, HIPAA_CONTROLS, GDPR_CONTROLS]) {
      const ids = new Set(controls.map((c) => c.id));
      expect(ids.size).toBe(controls.length);
    }
  });

  it('exposes NO evidence type the canonical engine cannot score', () => {
    // The Phase 10 bug: 97 UI-selectable types that scored nothing. Every type
    // the UI offers must be a canonical type the engine understands.
    const allTypes = new Set(SOC2_CONTROLS.flatMap((c) => c.types));
    for (const type of allTypes) {
      expect(CANONICAL_EVIDENCE_TYPES[type]).toBeDefined();
    }
  });

  it('maps every canonical type to a desktop storage category', () => {
    for (const type of Object.keys(CANONICAL_EVIDENCE_TYPES)) {
      expect(getCategoryForType(type)).toBeTruthy();
    }
  });

  it('control titles carry the control id prefix (UI contract)', () => {
    for (const control of SOC2_CONTROLS) {
      expect(control.title.startsWith(`${control.id} - `)).toBe(true);
    }
  });

  it('offers no fabricated ids in any framework catalog', () => {
    // The removed fabricated SOC 2 taxonomy must never reappear in any
    // upload catalog (guards the bug class found in the Settings panel).
    const fabricated = ['A3.2', 'C3.2', 'PI3.2', 'CA1.1'];
    const allIds = [SOC2_CONTROLS, ISO27001_CONTROLS, HIPAA_CONTROLS, GDPR_CONTROLS]
      .flatMap((cs) => cs.map((c) => c.id));
    for (const id of fabricated) {
      expect(allIds).not.toContain(id);
    }
  });

  it('every non-SOC 2 control also exposes only canonical evidence types', () => {
    for (const controls of [ISO27001_CONTROLS, HIPAA_CONTROLS, GDPR_CONTROLS]) {
      for (const control of controls) {
        expect(control.types.length).toBeGreaterThan(0);
        for (const type of control.types) {
          expect(CANONICAL_EVIDENCE_TYPES[type]).toBeDefined();
        }
      }
    }
  });
});
