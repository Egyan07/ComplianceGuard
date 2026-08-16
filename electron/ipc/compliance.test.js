import { describe, it, expect, beforeEach, vi } from 'vitest';
import registerComplianceHandlers from './compliance';
import { CanonicalEngine } from '../processing/canonical-engine';

// Require the mock file directly — the preload interception (and the
// resolve.alias) hand the module under test this same CJS cache entry, so
// ipcMain here is the same object compliance.js registers handlers on.
const { ipcMain, dialog } = require('../../__mocks__/electron.js');

const SOC2 = 1;

function makeDatabase({ evidence = [], history = [], createEvaluationImpl = null } = {}) {
  return {
    getAllEvidence: vi.fn(async () => evidence),
    getEvaluationHistory: vi.fn(async () => history),
    createEvaluation: createEvaluationImpl || vi.fn(async () => 42),
  };
}

function makeLicenseManager({ features = {} } = {}) {
  return {
    isFeatureAllowed: vi.fn((feature) => features[feature] === true),
  };
}

function register({ database, canonicalEngine, licenseManager } = {}) {
  const showNotification = vi.fn();
  const ctx = {
    database: database || makeDatabase(),
    canonicalEngine: canonicalEngine || new CanonicalEngine(),
    reportGenerator: {},
    licenseManager: licenseManager || makeLicenseManager(),
    showNotification,
    getMainWindow: () => null,
  };
  ipcMain.registeredHandlers = {};
  registerComplianceHandlers(ctx);
  return { ctx, showNotification };
}

describe('evaluate-compliance (canonical path)', () => {
  it('runs the real canonical engine over stored evidence and persists', async () => {
    const createEvaluation = vi.fn(async () => 7);
    const database = makeDatabase({
      evidence: [
        { evidence_type: 'users' },       // legacy alias -> user_provisioning
        { evidence_type: 'event_logs' },  // canonical
      ],
      createEvaluationImpl: createEvaluation,
    });
    const { ctx } = register({ database });

    const result = await ipcMain.registeredHandlers['evaluate-compliance'](null, SOC2);

    expect(database.getAllEvidence).toHaveBeenCalled();
    expect(createEvaluation).toHaveBeenCalledTimes(1);
    // Legacy alias was translated and persisted evaluation returned.
    expect(result.id).toBe(7);
    expect(result.overall_score).toBeGreaterThan(0);
    expect(result.overall_score).toBeLessThanOrEqual(100);
    expect(result.status).toMatch(/^(compliant|partial|non_compliant)$/);
    expect(result.total_controls).toBe(54);
    expect(result.not_assessed_controls).toBeLessThan(54);
    expect(ctx.showNotification).toHaveBeenCalled();
    // The notification text carries the 0-100 score, not a 0-1 fraction.
    const [title, body] = ctx.showNotification.mock.calls[0];
    expect(title).toMatch(/Complete/);
    expect(body).toContain(`${result.overall_score.toFixed(1)}%`);
  });

  it('returns an all-not-assessed evaluation when no evidence exists', async () => {
    const database = makeDatabase({ evidence: [] });
    const { ctx } = register({ database });

    const result = await ipcMain.registeredHandlers['evaluate-compliance'](null, SOC2);

    expect(result.overall_score).toBe(0);
    expect(result.status).toBe('non_compliant');
    expect(result.not_assessed_controls).toBe(54);
    expect(ctx.showNotification).toHaveBeenCalled();
  });

  it('maps framework id 4 to the GDPR canonical definitions', async () => {
    const database = makeDatabase({ evidence: [{ evidence_type: 'event_logs' }] });
    const { ctx } = register({ database });

    const result = await ipcMain.registeredHandlers['evaluate-compliance'](null, 4);

    expect(result.framework_name).toBe('GDPR');
    expect(result.total_controls).toBe(38);
    expect(ctx.showNotification).toHaveBeenCalled();
  });
});

describe('get-evaluation-history (Pro gate)', () => {
  it('refuses without the evaluation_history feature', async () => {
    const database = makeDatabase({ history: [] });
    const { ctx } = register({ database, licenseManager: makeLicenseManager({ features: {} }) });

    const result = await ipcMain.registeredHandlers['get-evaluation-history'](null, SOC2);

    expect(result.upgrade_required).toBe(true);
    expect(database.getEvaluationHistory).not.toHaveBeenCalled();
  });

  it('returns history when the feature is licensed', async () => {
    const database = makeDatabase({
      history: [{ id: 1, framework_id: SOC2, overall_score: 80, status: 'partial' }],
    });
    const { ctx } = register({
      database,
      licenseManager: makeLicenseManager({ features: { evaluation_history: true } }),
    });

    const result = await ipcMain.registeredHandlers['get-evaluation-history'](null, SOC2);

    expect(result).toHaveLength(1);
    expect(result[0].overall_score).toBe(80);
  });
});

describe('export-pdf-report (Pro gate)', () => {
  it('refuses without the pdf_reports feature', async () => {
    const database = makeDatabase();
    const { ctx } = register({ database, licenseManager: makeLicenseManager({ features: {} }) });

    const result = await ipcMain.registeredHandlers['export-pdf-report'](null, SOC2);

    expect(result.upgrade_required).toBe(true);
  });
});

describe('download-remediation-script', () => {
  it('rejects unknown control ids', async () => {
    const { ctx } = register();

    const result = await ipcMain.registeredHandlers['download-remediation-script'](null, 'CC999.9');

    expect(result.error).toMatch(/No PowerShell script available/);
  });

  it('returns canceled when the save dialog is dismissed', async () => {
    // The electron mock's showSaveDialog resolves { canceled: true }.
    const { ctx } = register();

    const result = await ipcMain.registeredHandlers['download-remediation-script'](null, 'CC6.3');

    expect(result.canceled).toBe(true);
    // No audit event is written for a canceled download (would need a db).
  });
});
