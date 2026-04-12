const path = require('path');
const fs = require('fs');
const crypto = require('crypto');

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
    const directories = [
      'Screenshots',
      'Documents',
      'SystemLogs',
      'ConfigFiles',
      'NetworkConfigs',
      'SecurityPolicies',
      'BackupFiles'
    ];

    directories.forEach(dir => {
      const dirPath = path.join(this.evidenceStoragePath, dir);
      if (!fs.existsSync(dirPath)) {
        fs.mkdirSync(dirPath, { recursive: true });
      }
    });
  }

  async saveEvidenceFile(fileBuffer, fileName, category, metadata = {}) {
    const categoryPath = path.join(this.evidenceStoragePath, category);

    if (!fs.existsSync(categoryPath)) {
      fs.mkdirSync(categoryPath, { recursive: true });
    }

    // Ensure unique filename
    let finalPath = path.join(categoryPath, fileName);
    let counter = 1;
    while (fs.existsSync(finalPath)) {
      const ext = path.extname(fileName);
      const name = path.basename(fileName, ext);
      finalPath = path.join(categoryPath, `${name}_${counter}${ext}`);
      counter++;
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

  async processWindowsEvidence(windowsEvidence, frameworkId) {
    const processedEvidence = [];

    // Process system information -> CC6.1
    if (windowsEvidence.systemInfo && !windowsEvidence.systemInfo.error) {
      const id = await this.db.addEvidence({
        framework_id: frameworkId,
        control_id: 'CC6.1',
        evidence_type: 'system_configs',
        title: 'Windows System Information',
        description: 'Automatically collected Windows system configuration',
        file_path: null,
        file_hash: null,
        metadata: windowsEvidence.systemInfo
      });
      processedEvidence.push(id);
    }

    // Process security settings -> CC1.1
    if (windowsEvidence.securitySettings && !windowsEvidence.securitySettings.error) {
      const id = await this.db.addEvidence({
        framework_id: frameworkId,
        control_id: 'CC1.1',
        evidence_type: 'security_policies',
        title: 'Windows Security Settings',
        description: 'Password policies, audit policies, and security configurations',
        file_path: null,
        file_hash: null,
        metadata: windowsEvidence.securitySettings
      });
      processedEvidence.push(id);
    }

    // Process event logs -> CC7.1 (save large logs as files)
    if (windowsEvidence.eventLogs) {
      for (const [logType, logData] of Object.entries(windowsEvidence.eventLogs)) {
        if (logType === 'error') continue;

        if (typeof logData === 'string' && logData.length > 1000) {
          const fileName = `event_log_${logType}_${Date.now()}.txt`;
          const fileBuffer = Buffer.from(logData, 'utf8');

          const savedFile = await this.saveEvidenceFile(
            fileBuffer, fileName, 'SystemLogs',
            { log_type: logType, source: 'windows_event_logs' }
          );

          const id = await this.db.addEvidence({
            framework_id: frameworkId,
            control_id: 'CC7.1',
            evidence_type: 'event_logs',
            title: `Windows ${logType} Event Logs`,
            description: `Collected Windows ${logType} event logs for compliance monitoring`,
            file_path: savedFile.file_path,
            file_hash: savedFile.file_hash,
            metadata: savedFile.metadata
          });
          processedEvidence.push(id);
        }
      }
    }

    // Process services -> CC6.1
    if (windowsEvidence.services && !windowsEvidence.services.error) {
      const id = await this.db.addEvidence({
        framework_id: frameworkId,
        control_id: 'CC6.1',
        evidence_type: 'system_configs',
        title: 'Windows Services Status',
        description: 'Critical Windows services and their operational status',
        file_path: null,
        file_hash: null,
        metadata: windowsEvidence.services
      });
      processedEvidence.push(id);
    }

    // Process firewall -> CC6.5
    if (windowsEvidence.firewall && !windowsEvidence.firewall.error) {
      const id = await this.db.addEvidence({
        framework_id: frameworkId,
        control_id: 'CC6.5',
        evidence_type: 'firewall_configs',
        title: 'Windows Firewall Status',
        description: 'Windows Firewall configuration and profile status',
        file_path: null,
        file_hash: null,
        metadata: windowsEvidence.firewall
      });
      processedEvidence.push(id);
    }

    // Process network -> CC6.5
    if (windowsEvidence.network && !windowsEvidence.network.error) {
      const id = await this.db.addEvidence({
        framework_id: frameworkId,
        control_id: 'CC6.5',
        evidence_type: 'network_configs',
        title: 'Network Configuration',
        description: 'Network interfaces, open ports, and routing configuration',
        file_path: null,
        file_hash: null,
        metadata: windowsEvidence.network
      });
      processedEvidence.push(id);
    }

    // Process user accounts -> CC6.2
    if (windowsEvidence.users && !windowsEvidence.users.error) {
      const id = await this.db.addEvidence({
        framework_id: frameworkId,
        control_id: 'CC6.2',
        evidence_type: 'user_provisioning',
        title: 'Windows User Accounts',
        description: 'Local user accounts and administrator group membership',
        file_path: null,
        file_hash: null,
        metadata: windowsEvidence.users
      });
      processedEvidence.push(id);
    }

    // Store full system evidence for trend analysis
    await this.db.storeSystemEvidence(
      'windows_comprehensive',
      'local_collection',
      windowsEvidence
    );

    // Audit log
    await this.db.logAudit(
      'COLLECT',
      'windows_evidence',
      frameworkId,
      null,
      { evidence_count: processedEvidence.length }
    );

    console.log(`Processed ${processedEvidence.length} evidence items`);
    return processedEvidence;
  }

  async processManualEvidence(evidenceData, frameworkId) {
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
        evidence_type: evidenceData.evidenceType || 'document',
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
        evidence_type: evidenceData.evidenceType || 'text',
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
