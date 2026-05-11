const LocalComplianceEngine = require('./compliance-engine');

function makeDb(evidenceRows = []) {
  return {
    getFrameworkById: vi.fn().mockResolvedValue({ id: 1, name: 'SOC 2 Type II' }),
    getAllEvidence: vi.fn().mockResolvedValue(evidenceRows),
    createEvaluation: vi.fn().mockResolvedValue(42),
  };
}

function makeLicense(tier = 'pro') {
  return {
    getControlIds: vi.fn().mockReturnValue(null), // null = allow all controls
    getTier: vi.fn().mockReturnValue(tier),
    isFeatureAllowed: vi.fn().mockReturnValue(true),
  };
}

describe('LocalComplianceEngine', () => {
  describe('_loadFrameworks()', () => {
    it('loads all three frameworks', () => {
      const engine = new LocalComplianceEngine(makeDb());
      expect(engine.frameworks[1]).toBeDefined();
      expect(engine.frameworks[2]).toBeDefined();
      expect(engine.frameworks[3]).toBeDefined();
    });

    it('SOC 2 framework has controls', () => {
      const engine = new LocalComplianceEngine(makeDb());
      expect(engine.frameworks[1].controls.length).toBeGreaterThan(0);
    });

    it('ISO 27001 framework has controls', () => {
      const engine = new LocalComplianceEngine(makeDb());
      expect(engine.frameworks[2].controls.length).toBeGreaterThan(0);
    });

    it('HIPAA framework has controls', () => {
      const engine = new LocalComplianceEngine(makeDb());
      expect(engine.frameworks[3].controls.length).toBeGreaterThan(0);
    });

    it('every control has a non-empty evidenceTypes array', () => {
      const engine = new LocalComplianceEngine(makeDb());
      for (const fw of Object.values(engine.frameworks)) {
        for (const control of fw.controls) {
          expect(Array.isArray(control.evidenceTypes), `${control.id} missing evidenceTypes`).toBe(true);
          expect(control.evidenceTypes.length, `${control.id} has empty evidenceTypes`).toBeGreaterThan(0);
        }
      }
    });
  });

  describe('evaluateControl()', () => {
    it('matches evidence by evidence_type, not control_id', () => {
      const engine = new LocalComplianceEngine(makeDb());
      const control = {
        id: 'A.9.2.1',
        title: 'User Registration',
        category: 'A.9',
        evidenceTypes: ['user_provisioning', 'system_configs'],
        weight: 1,
      };
      // Evidence stored with a SOC 2 control_id — should still match by type
      const evidence = [
        { id: 1, control_id: 'CC6.2', evidence_type: 'user_provisioning', title: 'Users', collected_at: new Date().toISOString() },
      ];
      const result = engine.evaluateControl(control, evidence);
      expect(result.available_evidence).toContain('user_provisioning');
      expect(result.score).toBeGreaterThan(0);
    });

    it('does NOT match evidence whose type is not in evidenceTypes', () => {
      const engine = new LocalComplianceEngine(makeDb());
      const control = {
        id: 'A.13.1.1',
        title: 'Network Controls',
        category: 'A.13',
        evidenceTypes: ['network_configs', 'firewall_configs'],
        weight: 1,
      };
      const evidence = [
        { id: 1, control_id: 'CC1.1', evidence_type: 'training_records', title: 'Training', collected_at: new Date().toISOString() },
      ];
      const result = engine.evaluateControl(control, evidence);
      expect(result.score).toBe(0);
      expect(result.status).toBe('not_assessed');
    });

    it('scores 100 when all required evidence types are present', () => {
      const engine = new LocalComplianceEngine(makeDb());
      const control = {
        id: 'TEST.1',
        title: 'Network Security',
        category: 'CC',
        evidenceTypes: ['firewall_configs', 'network_configs'],
        weight: 1,
      };
      const evidence = [
        { id: 1, control_id: 'any', evidence_type: 'firewall_configs', title: 'FW', collected_at: new Date().toISOString() },
        { id: 2, control_id: 'any', evidence_type: 'network_configs', title: 'Net', collected_at: new Date().toISOString() },
      ];
      const result = engine.evaluateControl(control, evidence);
      expect(result.score).toBe(100);
      expect(result.status).toBe('compliant');
    });
  });

  describe('evaluateCompliance()', () => {
    it('throws for unknown frameworkId', async () => {
      const engine = new LocalComplianceEngine(makeDb());
      await expect(engine.evaluateCompliance(99)).rejects.toThrow('Framework not found: 99');
    });

    it('calls db.getAllEvidence() not getEvidenceByFramework', async () => {
      const db = makeDb();
      const engine = new LocalComplianceEngine(db, makeLicense());
      await engine.evaluateCompliance(1);
      expect(db.getAllEvidence).toHaveBeenCalled();
      expect(db.getEvidenceByFramework).toBeUndefined();
    });

    it('uses ISO 27001 controls when frameworkId=2', async () => {
      const db = makeDb([
        { id: 1, control_id: 'CC6.2', evidence_type: 'user_provisioning', title: 'Users', collected_at: new Date().toISOString() },
      ]);
      const engine = new LocalComplianceEngine(db, makeLicense());
      const result = await engine.evaluateCompliance(2);
      expect(result.framework_id).toBe(2);
      expect(result.framework_name).toBe('ISO 27001:2013');
      expect(result.overall_score).toBeGreaterThan(0);
    });

    it('uses HIPAA controls when frameworkId=3', async () => {
      const db = makeDb([
        { id: 1, control_id: 'CC6.2', evidence_type: 'event_logs', title: 'Logs', collected_at: new Date().toISOString() },
      ]);
      const engine = new LocalComplianceEngine(db, makeLicense());
      const result = await engine.evaluateCompliance(3);
      expect(result.framework_id).toBe(3);
      expect(result.framework_name).toBe('HIPAA Security Rule');
      expect(result.overall_score).toBeGreaterThan(0);
    });

    it('persists evaluation to DB', async () => {
      const db = makeDb();
      const engine = new LocalComplianceEngine(db, makeLicense());
      const result = await engine.evaluateCompliance(1);
      expect(db.createEvaluation).toHaveBeenCalledWith(1, expect.any(Object));
      expect(result.id).toBe(42);
    });
  });
});
