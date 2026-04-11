const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const fs = require('fs');
const { app } = require('remote') || { getPath: (name) => path.join(process.env.APPDATA || process.env.HOME, 'ComplianceGuard', name) };

class ComplianceGuardDatabase {
  constructor() {
    this.db = null;
    this.dbPath = this.getDatabasePath();
    this.initialize();
  }

  getDatabasePath() {
    const userDataPath = app?.getPath('userData') ||
      path.join(process.env.APPDATA || process.env.HOME, 'ComplianceGuard');

    // Ensure directory exists
    if (!fs.existsSync(userDataPath)) {
      fs.mkdirSync(userDataPath, { recursive: true });
    }

    return path.join(userDataPath, 'complianceguard.db');
  }

  async initialize() {
    try {
      // Create database directory if it doesn't exist
      const dbDir = path.dirname(this.dbPath);
      if (!fs.existsSync(dbDir)) {
        fs.mkdirSync(dbDir, { recursive: true });
      }

      // Open database connection
      this.db = new sqlite3.Database(this.dbPath, (error) => {
        if (error) {
          console.error('Database connection error:', error);
          throw error;
        }
        console.log('Connected to ComplianceGuard database');
      });

      // Enable foreign keys
      this.db.run('PRAGMA foreign_keys = ON');

      // Initialize schema
      await this.initializeSchema();

      // Seed initial data
      await this.seedInitialData();

      return this;
    } catch (error) {
      console.error('Database initialization failed:', error);
      throw error;
    }
  }

  async initializeSchema() {
    const schema = [
      // Compliance frameworks
      `CREATE TABLE IF NOT EXISTS compliance_frameworks (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL UNIQUE,
        version TEXT DEFAULT '1.0',
        description TEXT,
        controls_json TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )`,

      // Evidence items
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

      // Compliance evaluations
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

      // Control assessments (detailed results)
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

      // System evidence (automatically collected)
      `CREATE TABLE IF NOT EXISTS system_evidence (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        evidence_type TEXT NOT NULL,
        source TEXT NOT NULL,
        data_json TEXT NOT NULL,
        collected_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        system_info_json TEXT
      )`,

      // User settings and preferences
      `CREATE TABLE IF NOT EXISTS user_settings (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        setting_key TEXT NOT NULL UNIQUE,
        setting_value TEXT,
        setting_type TEXT CHECK(setting_type IN ('string', 'number', 'boolean', 'json')) DEFAULT 'string',
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )`,

      // Audit trail for compliance
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

      // Scheduled tasks
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

    // Create indexes for better performance
    const indexes = [
      'CREATE INDEX IF NOT EXISTS idx_evidence_framework ON evidence_items(framework_id)',
      'CREATE INDEX IF NOT EXISTS idx_evidence_control ON evidence_items(control_id)',
      'CREATE INDEX IF NOT EXISTS idx_evaluations_framework ON evaluations(framework_id)',
      'CREATE INDEX IF NOT EXISTS idx_control_assessments_eval ON control_assessments(evaluation_id)',
      'CREATE INDEX IF NOT EXISTS idx_system_evidence_type ON system_evidence(evidence_type)',
      'CREATE INDEX IF NOT EXISTS idx_audit_log_action ON audit_log(action)',
      'CREATE INDEX IF NOT EXISTS idx_scheduled_tasks_next_run ON scheduled_tasks(next_run_at)'
    ];

    return new Promise((resolve, reject) => {
      // Run schema creation
      schema.forEach(sql => {
        this.db.run(sql, (error) => {
          if (error) {
            console.error('Schema creation error:', error);
          }
        });
      });

      // Run index creation
      indexes.forEach(sql => {
        this.db.run(sql, (error) => {
          if (error) {
            console.error('Index creation error:', error);
          }
        });
      });

      // Wait a bit for all operations to complete
      setTimeout(() => {
        console.log('Database schema initialized successfully');
        resolve();
      }, 1000);
    });
  }

  async seedInitialData() {
    // Insert default SOC 2 framework if not exists
    const soc2Framework = {
      name: 'SOC 2 Type II',
      version: '2017',
      description: 'AICPA SOC 2 Type II Trust Services Criteria',
      controls_json: JSON.stringify(this.getDefaultSOC2Controls())
    };

    return new Promise((resolve, reject) => {
      this.db.get(
        'SELECT id FROM compliance_frameworks WHERE name = ?',
        [soc2Framework.name],
        (error, row) => {
          if (error) {
            reject(error);
            return;
          }

          if (!row) {
            // Insert default framework
            this.db.run(
              'INSERT INTO compliance_frameworks (name, version, description, controls_json) VALUES (?, ?, ?, ?)',
              [soc2Framework.name, soc2Framework.version, soc2Framework.description, soc2Framework.controls_json],
              function(error) {
                if (error) {
                  reject(error);
                } else {
                  console.log('Default SOC 2 framework inserted with ID:', this.lastID);
                  resolve();
                }
              }
            );
          } else {
            resolve();
          }
        }
      );
    });
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
      // Add more controls as needed
    ];
  }

  // Database CRUD Operations
  async addEvidence(evidence) {
    return new Promise((resolve, reject) => {
      const sql = `INSERT INTO evidence_items
        (framework_id, control_id, evidence_type, title, description, file_path, file_hash, metadata_json)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)`;

      this.db.run(
        sql,
        [
          evidence.framework_id,
          evidence.control_id,
          evidence.evidence_type,
          evidence.title,
          evidence.description,
          evidence.file_path,
          evidence.file_hash,
          JSON.stringify(evidence.metadata || {})
        ],
        function(error) {
          if (error) {
            reject(error);
          } else {
            resolve(this.lastID);
          }
        }
      );
    });
  }

  async getEvidenceByFramework(frameworkId) {
    return new Promise((resolve, reject) => {
      const sql = `SELECT * FROM evidence_items WHERE framework_id = ? ORDER BY collected_at DESC`;

      this.db.all(sql, [frameworkId], (error, rows) => {
        if (error) {
          reject(error);
        } else {
          // Parse JSON fields
          const parsedRows = rows.map(row => ({
            ...row,
            metadata: row.metadata_json ? JSON.parse(row.metadata_json) : {}
          }));
          resolve(parsedRows);
        }
      });
    });
  }

  async createEvaluation(frameworkId, findings) {
    return new Promise((resolve, reject) => {
      const sql = `INSERT INTO evaluations (framework_id, findings_json) VALUES (?, ?)`;

      this.db.run(
        sql,
        [frameworkId, JSON.stringify(findings)],
        function(error) {
          if (error) {
            reject(error);
          } else {
            resolve(this.lastID);
          }
        }
      );
    });
  }

  async getLatestEvaluation(frameworkId) {
    return new Promise((resolve, reject) => {
      const sql = `SELECT * FROM evaluations WHERE framework_id = ? ORDER BY evaluation_date DESC LIMIT 1`;

      this.db.get(sql, [frameworkId], (error, row) => {
        if (error) {
          reject(error);
        } else {
          if (row) {
            row.findings = row.findings_json ? JSON.parse(row.findings_json) : {};
          }
          resolve(row);
        }
      });
    });
  }

  async storeSystemEvidence(evidenceType, source, data) {
    return new Promise((resolve, reject) => {
      const sql = `INSERT INTO system_evidence (evidence_type, source, data_json, system_info_json) VALUES (?, ?, ?, ?)`;

      const systemInfo = {
        hostname: require('os').hostname(),
        platform: process.platform,
        timestamp: new Date().toISOString()
      };

      this.db.run(
        sql,
        [evidenceType, source, JSON.stringify(data), JSON.stringify(systemInfo)],
        function(error) {
          if (error) {
            reject(error);
          } else {
            resolve(this.lastID);
          }
        }
      );
    });
  }

  async setUserSetting(key, value, type = 'string') {
    return new Promise((resolve, reject) => {
      const sql = `INSERT OR REPLACE INTO user_settings (setting_key, setting_value, setting_type) VALUES (?, ?, ?)`;

      this.db.run(sql, [key, value, type], function(error) {
        if (error) {
          reject(error);
        } else {
          resolve(this.lastID);
        }
      });
    });
  }

  async getUserSetting(key, defaultValue = null) {
    return new Promise((resolve, reject) => {
      const sql = `SELECT setting_value, setting_type FROM user_settings WHERE setting_key = ?`;

      this.db.get(sql, [key], (error, row) => {
        if (error) {
          reject(error);
        } else {
          if (row) {
            let value = row.setting_value;
            switch (row.setting_type) {
              case 'number':
                value = parseFloat(value);
                break;
              case 'boolean':
                value = value === 'true';
                break;
              case 'json':
                value = JSON.parse(value);
                break;
            }
            resolve(value);
          } else {
            resolve(defaultValue);
          }
        }
      });
    });
  }

  async logAudit(action, entityType, entityId, oldValues = null, newValues = null) {
    return new Promise((resolve, reject) => {
      const sql = `INSERT INTO audit_log (action, entity_type, entity_id, old_values_json, new_values_json) VALUES (?, ?, ?, ?, ?)`;

      this.db.run(
        sql,
        [action, entityType, entityId,
         oldValues ? JSON.stringify(oldValues) : null,
         newValues ? JSON.stringify(newValues) : null],
        function(error) {
          if (error) {
            reject(error);
          } else {
            resolve(this.lastID);
          }
        }
      );
    });
  }

  // Backup and maintenance operations
  async backup() {
    const backupPath = this.dbPath + '.backup-' + Date.now();
    return new Promise((resolve, reject) => {
      fs.copyFile(this.dbPath, backupPath, (error) => {
        if (error) {
          reject(error);
        } else {
          resolve(backupPath);
        }
      });
    });
  }

  async vacuum() {
    return new Promise((resolve, reject) => {
      this.db.run('VACUUM', (error) => {
        if (error) {
          reject(error);
        } else {
          resolve();
        }
      });
    });
  }

  close() {
    if (this.db) {
      this.db.close((error) => {
        if (error) {
          console.error('Database close error:', error);
        } else {
          console.log('Database connection closed');
        }
      });
    }
  }
}

module.exports = ComplianceGuardDatabase;