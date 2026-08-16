import { describe, expect, it } from 'vitest';
import {
  CANONICAL_EVIDENCE_TYPES,
  getCategoryForType,
  SOC2_CONTROLS,
} from './evidenceCatalog.generated';

describe('evidence catalog (generated from canonical shared data)', () => {
  it('covers all 54 SOC 2 controls with non-empty type lists', () => {
    expect(SOC2_CONTROLS.length).toBe(54);
    for (const control of SOC2_CONTROLS) {
      expect(control.types.length).toBeGreaterThan(0);
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
});
