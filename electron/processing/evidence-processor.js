const log = require('../logger');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const { logAuditEvent } = require('./audit-service');
const { isKnownEvidenceType } = require('./evidence-vocabulary');

// The only directories evidence may be written into. Used both to scaffold the
// dirs and to validate a (renderer-supplied) category, preventing path traversal.
const ALLOWED_CATEGORIES = [
  'Screenshots',
  'Documents',
  'SystemLogs',
  'ConfigFiles',
  'NetworkConfigs',
  'SecurityPolicies',
  'BackupFiles',
];

class LocalEvidenceProcessor {
  constructor(database, userDataPath) {
    this.db = database;
    this.evidenceStoragePath = path.join(
      userDataPath || process.env.APPDATA || process.env.HOME || '.',
      'ComplianceGuard',
      'Evidence'
    );
    this.ensureEvidenceDirectories();
  }

  ensureEvidenceDirectories() {
    ALLOWED_CATEGORIES.forEach(dir => {
      const dirPath = path.join(this.evidenceStoragePath, dir);
      if (!fs.existsSync(dirPath)) {
        fs.mkdirSync(dirPath, { recursive: true });
      }
    });
  }

  async saveEvidenceFile(fileBuffer, fileName, category, metadata = {}) {
    // Sanitize renderer-supplied inputs to prevent path traversal:
    //  - category must be one of the known dirs (else fall back to Documents)
    //  - fileName is reduced to its basename (strips ../ and absolute paths)
    const safeCategory = ALLOWED_CATEGORIES.includes(category) ? category : 'Documents';
    const safeName = path.basename(fileName) || `evidence_${Date.now()}`;
    const categoryPath = path.join(this.evidenceStoragePath, safeCategory);

    if (!fs.existsSync(categoryPath)) {
      fs.mkdirSync(categoryPath, { recursive: true });
    }

    // Ensure unique filename
    let finalPath = path.join(categoryPath, safeName);
    let counter = 1;
    while (fs.existsSync(finalPath)) {
      const ext = path.extname(safeName);
      const name = path.basename(safeName, ext);
      finalPath = path.join(categoryPath, `${name}_${counter}${ext}`);
      counter++;
    }

    // Defense-in-depth: never write outside the evidence root.
    const root = path.resolve(this.evidenceStoragePath);
    if (!path.resolve(finalPath).startsWith(root + path.sep)) {
      throw new Error('Refusing to write evidence file outside the evidence directory');
    }

    fs.writeFileSync(finalPath, fileBuffer);

    const fileHash = this.calculateFileHash(finalPath);

    return {
      file_path: finalPath,
      file_hash: fileHash,
      file_size: fs.statSync(finalPath).size,
      metadata: {
        ...metadata,
        saved_at: new Date().toISOString(),
        original_filename: fileName
      }
    };
  }

  calculateFileHash(filePath) {
    const fileBuffer = fs.readFileSync(filePath);
    const hashSum = crypto.createHash('sha256');
    hashSum.update(fileBuffer);
    return hashSum.digest('hex');
  }

  /**
   * Shared collector pipeline — Windows, macOS, and Linux evidence all flow
   * through here (the name predates the cross-platform collectors; the
   * buckets and canonical evidence types are identical on every platform).
   */
  async processWindowsEvidence(windowsEvidence, frameworkId) {
    const processedEvidence = [];
    const platform = this.getPlatformLabel(windowsEvidence);
    const platformKey = this.getPlatformKey(windowsEvidence);

    // Process system information
    // Evidence type: system_configs (used by all frameworks)
    if (windowsEvidence.systemInfo && !windowsEvidence.systemInfo.error) {
      const id = await this.db.addEvidence({
        framework_id: frameworkId,
        control_id: null, // canonical engine maps evidence_type -> control
        evidence_type: 'system_configs',
        title: `${platform} System Information`,
        description: `Automatically collected ${platform} system configuration`,
        file_path: null,
        file_hash: null,
        metadata: windowsEvidence.systemInfo
      });
      processedEvidence.push(id);
    }

    // Process security settings
    // Evidence type: security_policies (used by all frameworks)
    if (windowsEvidence.securitySettings && !windowsEvidence.securitySettings.error) {
      const id = await this.db.addEvidence({
        framework_id: frameworkId,
        control_id: null, // canonical engine maps evidence_type -> control
        evidence_type: 'security_policies',
        title: `${platform} Security Settings`,
        description: 'Password policies, audit policies, and security configurations',
        file_path: null,
        file_hash: null,
        metadata: windowsEvidence.securitySettings
      });
      processedEvidence.push(id);
    }

    // Process event logs
    // Evidence type: event_logs (used by all frameworks)
    if (windowsEvidence.eventLogs) {
      for (const [logType, logData] of Object.entries(windowsEvidence.eventLogs)) {
        if (logType === 'error') continue;

        if (typeof logData === 'string' && logData.length > 1000) {
          const fileName = `event_log_${logType}_${Date.now()}.txt`;
          const fileBuffer = Buffer.from(logData, 'utf8');

          const savedFile = await this.saveEvidenceFile(
            fileBuffer, fileName, 'SystemLogs',
            { log_type: logType, source: `${platformKey}_event_logs` }
          );

          const id = await this.db.addEvidence({
            framework_id: frameworkId,
            control_id: null, // canonical engine maps evidence_type -> control
            evidence_type: 'event_logs',
            title: `${platform} ${logType} Event Logs`,
            description: `Collected ${platform} ${logType} event logs for compliance monitoring`,
            file_path: savedFile.file_path,
            file_hash: savedFile.file_hash,
            metadata: savedFile.metadata
          });
          processedEvidence.push(id);
        }
      }
    }

    // Process services
    // Evidence type: system_configs (services are system configuration)
    if (windowsEvidence.services && !windowsEvidence.services.error) {
      const id = await this.db.addEvidence({
        framework_id: frameworkId,
        control_id: null, // canonical engine maps evidence_type -> control
        evidence_type: 'system_configs',
        title: `${platform} Services Status`,
        description: `Critical ${platform} services and their operational status`,
        file_path: null,
        file_hash: null,
        metadata: windowsEvidence.services
      });
      processedEvidence.push(id);
    }

    // Process firewall
    // Evidence type: firewall_configs (used by all frameworks)
    if (windowsEvidence.firewall && !windowsEvidence.firewall.error) {
      const id = await this.db.addEvidence({
        framework_id: frameworkId,
        control_id: null, // canonical engine maps evidence_type -> control
        evidence_type: 'firewall_configs',
        title: `${platform} Firewall Status`,
        description: `${platform} firewall configuration and profile status`,
        file_path: null,
        file_hash: null,
        metadata: windowsEvidence.firewall
      });
      processedEvidence.push(id);
    }

    // Process network
    // Evidence type: network_configs (used by all frameworks)
    if (windowsEvidence.network && !windowsEvidence.network.error) {
      const id = await this.db.addEvidence({
        framework_id: frameworkId,
        control_id: null, // canonical engine maps evidence_type -> control
        evidence_type: 'network_configs',
        title: 'Network Configuration',
        description: 'Network interfaces, open ports, and routing configuration',
        file_path: null,
        file_hash: null,
        metadata: windowsEvidence.network
      });
      processedEvidence.push(id);
    }

    // Process user accounts
    // Evidence type: user_provisioning (used by all frameworks)
    if (windowsEvidence.users && !windowsEvidence.users.error) {
      const id = await this.db.addEvidence({
        framework_id: frameworkId,
        control_id: null, // canonical engine maps evidence_type -> control
        evidence_type: 'user_provisioning',
        title: `${platform} User Accounts`,
        description: 'Local user accounts and administrator group membership',
        file_path: null,
        file_hash: null,
        metadata: windowsEvidence.users
      });
      processedEvidence.push(id);
    }

    // Store full system evidence for trend analysis
    await this.db.storeSystemEvidence(
      `${platformKey}_comprehensive`,
      'local_collection',
      windowsEvidence
    );

    // Audit log
    await this.db.logAudit(
      'COLLECT',
      `${platformKey}_evidence`,
      frameworkId,
      null,
      { evidence_count: processedEvidence.length }
    );

    try {
      if (this.db) {
        logAuditEvent(this.db, 'evidence_collected', {
          detail: { item_count: processedEvidence.length },
        });
      }
    } catch (auditErr) {
      log.error('Enterprise audit event failed for evidence_collected:', auditErr);
    }

    log.info(`Processed ${processedEvidence.length} evidence items`);
    return processedEvidence;
  }

  async processManualEvidence(evidenceData, frameworkId) {
    // Phase 11: reject evidence types the canonical engine cannot score instead
    // of silently storing them (the Phase 10 "97 dead upload types" finding).
    const evidenceType = evidenceData.evidenceType || (evidenceData.file ? 'document' : 'text');
    if (!isKnownEvidenceType(evidenceType)) {
      throw new Error(
        `Unknown evidence type "${evidenceType}". Choose a valid evidence type from the upload list.`
      );
    }

    // Handle file upload
    if (evidenceData.file) {
      const fileBuffer = evidenceData.file.buffer || evidenceData.file;
      const fileName = evidenceData.fileName || `evidence_${Date.now()}`;
      const category = evidenceData.category || 'Documents';

      const savedFile = await this.saveEvidenceFile(
        fileBuffer, fileName, category,
        {
          uploaded_by: evidenceData.uploadedBy || 'user',
          source: 'manual_upload',
          description: evidenceData.description
        }
      );

      const evidenceId = await this.db.addEvidence({
        framework_id: frameworkId,
        control_id: evidenceData.controlId,
        evidence_type: evidenceType,
        title: evidenceData.title,
        description: evidenceData.description,
        file_path: savedFile.file_path,
        file_hash: savedFile.file_hash,
        metadata: {
          ...savedFile.metadata,
          manual_upload: true,
          tags: evidenceData.tags || []
        }
      });

      return evidenceId;
    }

    // Handle text/JSON evidence
    if (evidenceData.content) {
      const evidenceId = await this.db.addEvidence({
        framework_id: frameworkId,
        control_id: evidenceData.controlId,
        evidence_type: evidenceType,
        title: evidenceData.title,
        description: evidenceData.description,
        file_path: null,
        file_hash: null,
        metadata: {
          content: evidenceData.content,
          content_type: evidenceData.contentType || 'text',
          source: 'manual_entry',
          tags: evidenceData.tags || []
        }
      });

      return evidenceId;
    }

    throw new Error('Invalid evidence data: must provide file or content');
  }

  /**
   * Human-readable platform label for evidence titles. All collectors set
   * systemInfo.platform (os.platform()); fall back to Windows when absent.
   */
  getPlatformLabel(evidence) {
    const p = evidence && evidence.systemInfo && evidence.systemInfo.platform;
    if (p === 'darwin') return 'macOS';
    if (p === 'linux') return 'Linux';
    return 'Windows';
  }

  /**
   * Storage-safe platform key ('windows' | 'macos' | 'linux') for system
   * evidence types, audit entity types, and file metadata. Maps the collector
   * os.platform() values (win32/darwin/linux) so the legacy 'windows_*' keys
   * stay byte-identical for existing Windows databases.
   */
  getPlatformKey(evidence) {
    const p = evidence && evidence.systemInfo && evidence.systemInfo.platform;
    if (p === 'darwin') return 'macos';
    if (p === 'linux') return 'linux';
    return 'windows';
  }

  async getEvidenceSummary(frameworkId) {
    const evidence = await this.db.getEvidenceByFramework(frameworkId);

    const summary = {
      total_evidence: evidence.length,
      by_type: {},
      by_control: {},
      recent_evidence: [],
      file_evidence_count: 0,
      metadata_evidence_count: 0
    };

    evidence.forEach(item => {
      summary.by_type[item.evidence_type] = (summary.by_type[item.evidence_type] || 0) + 1;
      summary.by_control[item.control_id] = (summary.by_control[item.control_id] || 0) + 1;

      if (item.file_path) {
        summary.file_evidence_count++;
      } else {
        summary.metadata_evidence_count++;
      }

      if (summary.recent_evidence.length < 10) {
        summary.recent_evidence.push({
          id: item.id,
          title: item.title,
          type: item.evidence_type,
          control_id: item.control_id,
          collected_at: item.collected_at
        });
      }
    });

    return summary;
  }

  async searchEvidence(frameworkId, searchTerm, filters = {}) {
    let evidence = await this.db.getEvidenceByFramework(frameworkId);

    if (searchTerm) {
      const term = searchTerm.toLowerCase();
      evidence = evidence.filter(item =>
        (item.title && item.title.toLowerCase().includes(term)) ||
        (item.description && item.description.toLowerCase().includes(term)) ||
        (item.evidence_type && item.evidence_type.toLowerCase().includes(term))
      );
    }

    if (filters.evidence_type) {
      evidence = evidence.filter(item => item.evidence_type === filters.evidence_type);
    }

    if (filters.control_id) {
      evidence = evidence.filter(item => item.control_id === filters.control_id);
    }

    if (filters.date_from) {
      evidence = evidence.filter(item => new Date(item.collected_at) >= new Date(filters.date_from));
    }

    if (filters.date_to) {
      evidence = evidence.filter(item => new Date(item.collected_at) <= new Date(filters.date_to));
    }

    return evidence;
  }

  async deleteEvidence(evidenceId) {
    const evidence = await this.db.getEvidenceById(evidenceId);
    if (!evidence) {
      throw new Error('Evidence not found');
    }

    // Delete associated file if exists
    if (evidence.file_path && fs.existsSync(evidence.file_path)) {
      fs.unlinkSync(evidence.file_path);
    }

    // Delete from database
    await this.db.deleteEvidence(evidenceId);

    // Audit log
    await this.db.logAudit('DELETE', 'evidence_items', evidenceId, evidence, null);

    return true;
  }

  async exportEvidence(frameworkId, format = 'json') {
    const evidence = await this.db.getEvidenceByFramework(frameworkId);

    if (format === 'json') {
      return {
        framework_id: frameworkId,
        export_date: new Date().toISOString(),
        total_evidence: evidence.length,
        evidence: evidence.map(item => ({
          id: item.id,
          control_id: item.control_id,
          evidence_type: item.evidence_type,
          title: item.title,
          description: item.description,
          collected_at: item.collected_at,
          file_path: item.file_path,
          metadata: item.metadata
        }))
      };
    }

    if (format === 'csv') {
      const headers = ['ID', 'Control ID', 'Type', 'Title', 'Description', 'Collected At', 'File Path'];
      const rows = evidence.map(item => [
        item.id,
        item.control_id,
        item.evidence_type,
        item.title,
        item.description || '',
        item.collected_at,
        item.file_path || 'N/A'
      ]);

      return [headers, ...rows]
        .map(row => row.map(field => `"${String(field).replace(/"/g, '""')}"`).join(','))
        .join('\n');
    }

    throw new Error(`Unsupported export format: ${format}`);
  }
}

module.exports = LocalEvidenceProcessor;
