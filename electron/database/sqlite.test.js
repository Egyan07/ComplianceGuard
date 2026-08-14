const path = require('path');
const os = require('os');
const fs = require('fs');
const ComplianceGuardDatabase = require('./sqlite');

describe('ComplianceGuardDatabase', () => {
  let db;
  let tmpDir;

  beforeEach(async () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cg-test-'));
    db = new ComplianceGuardDatabase();
    await db.initialize(tmpDir);
  });

  afterEach(async () => {
    await db.close();
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  describe('seedInitialData', () => {
    it('seeds ISO 27001 framework row with id=2', async () => {
      const row = await db.get(
        'SELECT * FROM compliance_frameworks WHERE id = 2'
      );
      expect(row).toBeDefined();
      expect(row.name).toBe('ISO 27001:2013');
    });

    it('seeds HIPAA framework row with id=3', async () => {
      const row = await db.get(
        'SELECT * FROM compliance_frameworks WHERE id = 3'
      );
      expect(row).toBeDefined();
      expect(row.name).toBe('HIPAA Security Rule');
    });

    it('seeds GDPR framework row with id=4', async () => {
      const row = await db.get(
        'SELECT * FROM compliance_frameworks WHERE id = 4'
      );
      expect(row).toBeDefined();
      expect(row.name).toBe('GDPR');
      expect(row.version).toBe('2018');
    });

    it('seed is idempotent — re-initializing does not throw', async () => {
      await expect(db.seedInitialData()).resolves.not.toThrow();
    });
  });

  describe('getAllEvidence', () => {
    it('returns empty array when no evidence exists', async () => {
      const result = await db.getAllEvidence();
      expect(Array.isArray(result)).toBe(true);
      expect(result).toHaveLength(0);
    });

    it('returns all evidence regardless of framework_id', async () => {
      await db.addEvidence({
        framework_id: 1,
        control_id: 'CC6.1',
        evidence_type: 'system_configs',
        title: 'SOC 2 evidence',
        description: 'test',
        file_path: null,
        file_hash: null,
        metadata: {}
      });
      await db.addEvidence({
        framework_id: 2,
        control_id: 'A.9.2.1',
        evidence_type: 'user_provisioning',
        title: 'ISO 27001 evidence',
        description: 'test',
        file_path: null,
        file_hash: null,
        metadata: {}
      });

      const result = await db.getAllEvidence();
      expect(result).toHaveLength(2);
      const types = result.map(r => r.evidence_type);
      expect(types).toContain('system_configs');
      expect(types).toContain('user_provisioning');
    });

    it('parses metadata_json on each row', async () => {
      await db.addEvidence({
        framework_id: 1,
        control_id: 'CC7.1',
        evidence_type: 'event_logs',
        title: 'Logs',
        description: '',
        file_path: null,
        file_hash: null,
        metadata: { source: 'windows' }
      });

      const result = await db.getAllEvidence();
      expect(result[0].metadata).toEqual({ source: 'windows' });
    });
  });
});
