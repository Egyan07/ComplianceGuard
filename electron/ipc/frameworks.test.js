import { describe, it, expect, beforeEach } from 'vitest';
import registerFrameworkHandlers from './frameworks';
import { CanonicalEngine } from '../processing/canonical-engine';

// Same mocked ipcMain object the module under test registers handlers on.
const { ipcMain } = require('../../__mocks__/electron.js');

// Browser framework ids (1-4) -> canonical engine keys.
const FRAMEWORK_MAP = {
  1: 'soc2',
  2: 'iso27001',
  3: 'hipaa',
  4: 'gdpr',
};

function register() {
  ipcMain.registeredHandlers = {};
  registerFrameworkHandlers();
  return ipcMain.registeredHandlers['get-framework-controls'];
}

describe('framework browser <-> canonical engine parity', () => {
  let handler;
  let engine;

  beforeEach(() => {
    handler = register();
    engine = new CanonicalEngine();
  });

  for (const [browserId, engineKey] of Object.entries(FRAMEWORK_MAP)) {
    const frameworkId = Number(browserId);

    it(`framework ${frameworkId} (${engineKey}): browser controls match the scoring engine`, () => {
      const browser = handler(null, frameworkId);
      expect(browser.error).toBeUndefined();
      expect(browser.frameworkId).toBe(frameworkId);

      const engineControls = engine._loadFramework(engineKey).controls;

      // 1. Same count.
      expect(browser.controls.length).toBe(engineControls.length);

      // 2. Every browser control exists in the engine, same order.
      const engineIds = engineControls.map((c) => c.id);
      const browserIds = browser.controls.map((c) => c.id);
      expect(browserIds).toEqual(engineIds);

      // 3. Categories match the canonical definitions.
      for (let i = 0; i < browser.controls.length; i++) {
        expect(browser.controls[i].category).toBe(engineControls[i].category);
        expect(browser.controls[i].title).toBe(engineControls[i].title);
        expect(browser.controls[i].risk_level).toBe(engineControls[i].risk_level ?? 'medium');
      }

      // 4. No scoring control is hidden from the browser and vice versa.
      const engineSet = new Set(engineIds);
      for (const c of browser.controls) {
        expect(engineSet.has(c.id)).toBe(true);
      }

      // 5. Internal scoring fields must not leak to the renderer.
      for (const c of browser.controls) {
        expect(c.required_evidence).toBeUndefined();
        expect(c.evidence_mapping).toBeUndefined();
        expect(c.required).toBeUndefined();
      }
    });
  }

  it('HIPAA browser data carries specification_type (required|addressable) on every control', () => {
    const browser = handler(null, 3);
    expect(browser.error).toBeUndefined();
    const withSpec = browser.controls.filter((c) => c.specification_type);
    expect(withSpec.length).toBe(browser.controls.length);
    for (const c of withSpec) {
      expect(['required', 'addressable']).toContain(c.specification_type);
    }
  });

  it('GDPR browser data carries chapter metadata (display-only, preserved)', () => {
    const browser = handler(null, 4);
    expect(browser.error).toBeUndefined();
    const withChapter = browser.controls.filter((c) => c.chapter);
    expect(withChapter.length).toBe(browser.controls.length);
  });

  it('rejects unknown framework ids without throwing', () => {
    const result = handler(null, 99);
    expect(result.error).toContain('Unknown framework');
  });
});
