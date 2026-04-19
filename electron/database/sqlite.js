const log = require('../logger');
const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

class ComplianceGuardDatabase {
  constructor() {
    this.db = null;
    this.dbPath = null;
  }

  getDatabasePath(userDataPath) {
    const dataDir = userDataPath || path.join(
      process.env.APPDATA || process.env.HOME || '.',
      'ComplianceGuard'
    );

    if (!fs.existsSync(dataDir)) {
      fs.mkdirSync(dataDir, { recursive: true });
    }

    return path.join(dataDir, 'complianceguard.db');
  }

  async initialize(userDataPath) {
    try {
      this.dbPath = this.getDatabasePath(userDataPath);

      const dbDir = path.dirname(this.dbPath);
      if (!fs.existsSync(dbDir)) {
        fs.mkdirSync(dbDir, { recursive: true });
      }

      this.db = new Database(this.dbPath);
      this.db.pragma('foreign_keys = ON');
      this.db.pragma('journal_mode = WAL');

      log.info('Connected to ComplianceGuard database at:', this.dbPath);

      this.initializeSchema();
      this.seedInitialData();

      return this;
    } catch (error) {
      log.error('Database initialization failed:', error);
      throw error;
    }
  }

  // Synchronous wrappers that match the original async API signatures
  run(sql, params = []) {
    try {
      const stmt = this.db.prepare(sql);
      const result = stmt.run(params);
      return Promise.resolve({ lastID: result.lastInsertRowid, changes: result.changes });
    } catch (error) {
      return Promise.reject(error);
    }
  }

  get(sql, params = []) {
    try {
      const stmt = this.db.prepare(sql);
      const row = stmt.get(params);
      return Promise.resolve(row || undefined);
    } catch (error) {
      return Promise.reject(error);
    }
  }

  all(sql, params = []) {
    try {
      const stmt = this.db.prepare(sql);
      const rows = stmt.all(params);
      return Promise.resolve(rows);
    } catch (error) {
      return Promise.reject(error);
    }
  }

  initializeSchema() {
    const tables = [
      `CREATE TABLE IF NOT EXISTS compliance_frameworks (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL UNIQUE,
        version TEXT DEFAULT '1.0',
        description TEXT,
        controls_json TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )`,

      `CREATE TABLE IF NOT EXISTS evidence_items (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        framework_id INTEGER,
        control_id TEXT NOT NULL,
        evidence_type TEXT NOT NULL,
        title TEXT NOT NULL,
        description TEXT,
        file_path TEXT,
        file_hash TEXT,
        metadata_json TEXT,
        collected_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        created_by TEXT DEFAULT 'system',
        FOREIGN KEY (framework_id) REFERENCES compliance_frameworks(id) ON DELETE CASCADE
      )`,

      `CREATE TABLE IF NOT EXISTS evaluations (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        framework_id INTEGER,
        evaluation_date DATETIME DEFAULT CURRENT_TIMESTAMP,
        overall_score REAL,
        status TEXT CHECK(status IN ('compliant', 'non_compliant', 'partial', 'not_assessed')) DEFAULT 'not_assessed',
        findings_json TEXT,
        notes TEXT,
        created_by TEXT DEFAULT 'system',
        FOREIGN KEY (framework_id) REFERENCES compliance_frameworks(id) ON DELETE CASCADE
      )`,

      `CREATE TABLE IF NOT EXISTS control_assessments (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        evaluation_id INTEGER,
        control_id TEXT NOT NULL,
        control_category TEXT,
        status TEXT CHECK(status IN ('compliant', 'non_compliant', 'partial', 'not_assessed')) DEFAULT 'not_assessed',
        score REAL,
        evidence_count INTEGER DEFAULT 0,
        gaps_json TEXT,
        recommendations_json TEXT,
        assessed_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (evaluation_id) REFERENCES evaluations(id) ON DELETE CASCADE
      )`,

      `CREATE TABLE IF NOT EXISTS system_evidence (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        evidence_type TEXT NOT NULL,
        source TEXT NOT NULL,
        data_json TEXT NOT NULL,
        collected_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        system_info_json TEXT
      )`,

      `CREATE TABLE IF NOT EXISTS user_settings (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        setting_key TEXT NOT NULL UNIQUE,
        setting_value TEXT,
        setting_type TEXT CHECK(setting_type IN ('string', 'number', 'boolean', 'json')) DEFAULT 'string',
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )`,

      `CREATE TABLE IF NOT EXISTS audit_log (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        action TEXT NOT NULL,
        entity_type TEXT,
        entity_id INTEGER,
        old_values_json TEXT,
        new_values_json TEXT,
        user_id TEXT DEFAULT 'system',
        timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
        ip_address TEXT
      )`,

      `CREATE TABLE IF NOT EXISTS scheduled_tasks (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        task_name TEXT NOT NULL,
        task_type TEXT NOT NULL,
        schedule_config_json TEXT,
        last_run_at DATETIME,
        next_run_at DATETIME,
        status TEXT CHECK(status IN ('active', 'paused', 'completed', 'failed')) DEFAULT 'active',
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )`
    ];

    const indexes = [
      'CREATE INDEX IF NOT EXISTS idx_evidence_framework ON evidence_items(framework_id)',
      'CREATE INDEX IF NOT EXISTS idx_evidence_control ON evidence_items(control_id)',
      'CREATE INDEX IF NOT EXISTS idx_evaluations_framework ON evaluations(framework_id)',
      'CREATE INDEX IF NOT EXISTS idx_control_assessments_eval ON control_assessments(evaluation_id)',
      'CREATE INDEX IF NOT EXISTS idx_system_evidence_type ON system_evidence(evidence_type)',
      'CREATE INDEX IF NOT EXISTS idx_audit_log_action ON audit_log(action)',
      'CREATE INDEX IF NOT EXISTS idx_scheduled_tasks_next_run ON scheduled_tasks(next_run_at)'
    ];

    for (const sql of tables) {
      this.db.exec(sql);
    }
    for (const sql of indexes) {
      this.db.exec(sql);
    }

    log.info('Database schema initialized successfully');
  }

  seedInitialData() {
    const row = this.db.prepare(
      'SELECT id FROM compliance_frameworks WHERE name = ?'
    ).get('SOC 2 Type II');

    if (!row) {
      const controls = this.getDefaultSOC2Controls();
      this.db.prepare(
        'INSERT INTO compliance_frameworks (name, version, description, controls_json) VALUES (?, ?, ?, ?)'
      ).run('SOC 2 Type II', '2017', 'AICPA SOC 2 Type II Trust Services Criteria', JSON.stringify(controls));
      log.info('Default SOC 2 framework seeded');
    }
  }

  getDefaultSOC2Controls() {
    return [
      {
        id: 'CC1.1',
        category: 'Control Environment',
        title: 'Integrity and Ethical Values',
        description: 'The entity demonstrates a commitment to integrity and ethical values',
        evidenceTypes: ['policy_document', 'training_records', 'code_of_conduct']
      },
      {
        id: 'CC6.1',
        category: 'Logical and Physical Access Controls',
        title: 'Access Controls',
        description: 'The entity restricts logical and physical access to the system',
        evidenceTypes: ['access_logs', 'user_accounts', 'system_configs']
      },
      {
        id: 'A1.1',
        category: 'Availability',
        title: 'System Availability',
        description: 'The entity maintains availability of the system',
        evidenceTypes: ['uptime_logs', 'backup_logs', 'incident_reports']
      }
    ];
  }

  // ---- CRUD Operations ----

  async addEvidence(evidence) {
    const result = await this.run(
      `INSERT INTO evidence_items
        (framework_id, control_id, evidence_type, title, description, file_path, file_hash, metadata_json)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        evidence.framework_id,
        evidence.control_id,
        evidence.evidence_type,
        evidence.title,
        evidence.description,
        evidence.file_path,
        evidence.file_hash,
        JSON.stringify(evidence.metadata || {})
      ]
    );
    return result.lastID;
  }

  async getEvidenceById(evidenceId) {
    const row = await this.get(
      'SELECT * FROM evidence_items WHERE id = ?',
      [evidenceId]
    );
    if (row && row.metadata_json) {
      row.metadata = JSON.parse(row.metadata_json);
    }
    return row || null;
  }

  async getEvidenceByFramework(frameworkId) {
    const rows = await this.all(
      'SELECT * FROM evidence_items WHERE framework_id = ? ORDER BY collected_at DESC',
      [frameworkId]
    );
    return rows.map(row => ({
      ...row,
      metadata: row.metadata_json ? JSON.parse(row.metadata_json) : {}
    }));
  }

  async deleteEvidence(evidenceId) {
    const result = await this.run(
      'DELETE FROM evidence_items WHERE id = ?',
      [evidenceId]
    );
    return result.changes > 0;
  }

  async createEvaluation(frameworkId, findings) {
    const result = await this.run(
      `INSERT INTO evaluations (framework_id, overall_score, status, findings_json)
       VALUES (?, ?, ?, ?)`,
      [
        frameworkId,
        findings.overall_score || 0,
        findings.status || 'not_assessed',
        JSON.stringify(findings)
      ]
    );
    return result.lastID;
  }

  async getLatestEvaluation(frameworkId) {
    const row = await this.get(
      'SELECT * FROM evaluations WHERE framework_id = ? ORDER BY evaluation_date DESC LIMIT 1',
      [frameworkId]
    );
    if (row && row.findings_json) {
      row.findings = JSON.parse(row.findings_json);
    }
    return row || null;
  }

  async getEvaluationHistory(frameworkId, limit = 20) {
    const rows = await this.all(
      'SELECT * FROM evaluations WHERE framework_id = ? ORDER BY evaluation_date DESC LIMIT ?',
      [frameworkId, limit]
    );
    return rows.map(row => ({
      ...row,
      findings: row.findings_json ? JSON.parse(row.findings_json) : {}
    }));
  }

  async getFrameworkById(frameworkId) {
    const row = await this.get(
      'SELECT * FROM compliance_frameworks WHERE id = ?',
      [frameworkId]
    );
    if (row && row.controls_json) {
      row.controls = JSON.parse(row.controls_json);
    }
    return row || null;
  }

  async getAllFrameworks() {
    const rows = await this.all('SELECT * FROM compliance_frameworks ORDER BY name');
    return rows.map(row => ({
      ...row,
      controls: row.controls_json ? JSON.parse(row.controls_json) : []
    }));
  }

  async storeSystemEvidence(evidenceType, source, data) {
    const os = require('os');
    const systemInfo = {
      hostname: os.hostname(),
      platform: process.platform,
      timestamp: new Date().toISOString()
    };

    const result = await this.run(
      'INSERT INTO system_evidence (evidence_type, source, data_json, system_info_json) VALUES (?, ?, ?, ?)',
      [evidenceType, source, JSON.stringify(data), JSON.stringify(systemInfo)]
    );
    return result.lastID;
  }

  async setUserSetting(key, value, type = 'string') {
    await this.run(
      'INSERT OR REPLACE INTO user_settings (setting_key, setting_value, setting_type, updated_at) VALUES (?, ?, ?, CURRENT_TIMESTAMP)',
      [key, value, type]
    );
  }

  async getUserSetting(key, defaultValue = null) {
    const row = await this.get(
      'SELECT setting_value, setting_type FROM user_settings WHERE setting_key = ?',
      [key]
    );

    if (!row) return defaultValue;

    switch (row.setting_type) {
      case 'number':
        return parseFloat(row.setting_value);
      case 'boolean':
        return row.setting_value === 'true';
      case 'json':
        try { return JSON.parse(row.setting_value); }
        catch { return defaultValue; }
      default:
        return row.setting_value;
    }
  }

  async logAudit(action, entityType, entityId, oldValues = null, newValues = null) {
    await this.run(
      'INSERT INTO audit_log (action, entity_type, entity_id, old_values_json, new_values_json) VALUES (?, ?, ?, ?, ?)',
      [
        action,
        entityType,
        entityId,
        oldValues ? JSON.stringify(oldValues) : null,
        newValues ? JSON.stringify(newValues) : null
      ]
    );
  }

  async backup() {
    const backupPath = this.dbPath + '.backup-' + Date.now();
    return new Promise((resolve, reject) => {
      fs.copyFile(this.dbPath, backupPath, (error) => {
        if (error) reject(error);
        else resolve(backupPath);
      });
    });
  }

  async vacuum() {
    this.db.exec('VACUUM');
  }

  close() {
    try {
      if (this.db) {
        this.db.close();
        log.info('Database connection closed');
      }
      return Promise.resolve();
    } catch (error) {
      log.error('Database close error:', error);
      return Promise.reject(error);
    }
  }
}

module.exports = ComplianceGuardDatabase;
