const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const { app } = require('remote') || { getPath: (name) => path.join(process.env.APPDATA || process.env.HOME, 'ComplianceGuard', name) };

class LocalEvidenceProcessor {
  constructor(database) {
    this.db = database;
    this.evidenceStoragePath = this.getEvidenceStoragePath();
    this.ensureEvidenceDirectories();
  }

  getEvidenceStoragePath() {
    const userDataPath = app?.getPath('userData') ||
      path.join(process.env.APPDATA || process.env.HOME, 'ComplianceGuard');
    return path.join(userDataPath, 'Evidence');
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
    try {
      const categoryPath = path.join(this.evidenceStoragePath, category);
      const filePath = path.join(categoryPath, fileName);

      // Ensure unique filename
      let finalPath = filePath;
      let counter = 1;
      while (fs.existsSync(finalPath)) {
        const ext = path.extname(filePath);
        const name = path.basename(filePath, ext);
        finalPath = path.join(categoryPath, `${name}_${counter}${ext}`);
        counter++;
      }

      // Write file
      fs.writeFileSync(finalPath, fileBuffer);

      // Calculate file hash
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
    } catch (error) {
      console.error('Error saving evidence file:', error);
      throw error;
    }
  }

  calculateFileHash(filePath) {
    const fileBuffer = fs.readFileSync(filePath);
    const hashSum = crypto.createHash('sha256');
    hashSum.update(fileBuffer);
    return hashSum.digest('hex');
  }

  async processWindowsEvidence(windowsEvidence, frameworkId) {
    const processedEvidence = [];

    try {
      // Process system information
      if (windowsEvidence.systemInfo) {
        const evidence = await this.db.addEvidence({
          framework_id: frameworkId,
          control_id: 'CC6.1', // System access controls
          evidence_type: 'system_information',
          title: 'Windows System Information',
          description: 'Automatically collected Windows system configuration',
          file_path: null,
          file_hash: null,
          metadata: windowsEvidence.systemInfo
        });
        processedEvidence.push(evidence);
      }

      // Process security settings
      if (windowsEvidence.securitySettings) {
        const evidence = await this.db.addEvidence({
          framework_id: frameworkId,
          control_id: 'CC1.1', // Control environment
          evidence_type: 'security_configuration',
          title: 'Windows Security Settings',
          description: 'Password policies, audit policies, and security configurations',
          file_path: null,
          file_hash: null,
          metadata: windowsEvidence.securitySettings
        });
        processedEvidence.push(evidence);
      }

      // Process event logs (save as file if large)
      if (windowsEvidence.eventLogs) {
        for (const [logType, logData] of Object.entries(windowsEvidence.eventLogs)) {
          if (typeof logData === 'string' && logData.length > 1000) {
            const fileName = `event_log_${logType}_${Date.now()}.txt`;
            const fileBuffer = Buffer.from(logData, 'utf8');

            const savedFile = await this.saveEvidenceFile(
              fileBuffer,
              fileName,
              'SystemLogs',
              { log_type: logType, source: 'windows_event_logs' }
            );

            const evidence = await this.db.addEvidence({
              framework_id: frameworkId,
              control_id: 'CC7.1', // System monitoring
              evidence_type: 'event_logs',
              title: `Windows ${logType} Event Logs`,
              description: `Collected Windows ${logType} event logs for compliance monitoring`,
              file_path: savedFile.file_path,
              file_hash: savedFile.file_hash,
              metadata: savedFile.metadata
            });
            processedEvidence.push(evidence);
          }
        }
      }

      // Process services information
      if (windowsEvidence.services) {
        const evidence = await this.db.addEvidence({
          framework_id: frameworkId,
          control_id: 'CC6.1', // Access controls
          evidence_type: 'service_configuration',
          title: 'Windows Services Status',
          description: 'Critical Windows services and their operational status',
          file_path: null,
          file_hash: null,
          metadata: windowsEvidence.services
        });
        processedEvidence.push(evidence);
      }

      // Process firewall configuration
      if (windowsEvidence.firewall) {
        const evidence = await this.db.addEvidence({
          framework_id: frameworkId,
          control_id: 'CC6.1', // Network security
          evidence_type: 'firewall_configuration',
          title: 'Windows Firewall Status',
          description: 'Windows Firewall configuration and profile status',
          file_path: null,
          file_hash: null,
          metadata: windowsEvidence.firewall
        });
        processedEvidence.push(evidence);
      }

      // Process network configuration
      if (windowsEvidence.network) {
        const evidence = await this.db.addEvidence({
          framework_id: frameworkId,
          control_id: 'CC6.2', // Network controls
          evidence_type: 'network_configuration',
          title: 'Network Configuration',
          description: 'Network interfaces, open ports, and routing configuration',
          file_path: null,
          file_hash: null,
          metadata: windowsEvidence.network
        });
        processedEvidence.push(evidence);
      }

      // Store system evidence for trend analysis
      await this.db.storeSystemEvidence(
        'windows_comprehensive',
        'local_collection',
        windowsEvidence
      );

      console.log(`Processed ${processedEvidence.length} evidence items`);
      return processedEvidence;

    } catch (error) {
      console.error('Error processing Windows evidence:', error);
      throw error;
    }
  }

  async processManualEvidence(evidenceData, frameworkId) {
    try {
      // Handle file upload
      if (evidenceData.file) {
        const fileBuffer = evidenceData.file.buffer || evidenceData.file;
        const fileName = evidenceData.fileName || evidenceData.file.name || `evidence_${Date.now()}`;
        const category = evidenceData.category || 'Documents';

        const savedFile = await this.saveEvidenceFile(
          fileBuffer,
          fileName,
          category,
          {
            uploaded_by: evidenceData.uploadedBy || 'user',
            source: 'manual_upload',
            description: evidenceData.description
          }
        );

        const evidence = await this.db.addEvidence({
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

        return evidence;
      }

      // Handle text/JSON evidence
      else if (evidenceData.content) {
        const evidence = await this.db.addEvidence({
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

        return evidence;
      }

      throw new Error('Invalid evidence data: must provide file or content');

    } catch (error) {
      console.error('Error processing manual evidence:', error);
      throw error;
    }
  }

  async getEvidenceSummary(frameworkId) {
    try {
      const evidence = await this.db.getEvidenceByFramework(frameworkId);

      const summary = {
        total_evidence: evidence.length,
        by_type: {},
        by_control: {},
        recent_evidence: [],
        file_evidence: [],
        metadata_evidence: []
      };

      evidence.forEach(item => {
        // Count by type
        summary.by_type[item.evidence_type] = (summary.by_type[item.evidence_type] || 0) + 1;

        // Count by control
        summary.by_control[item.control_id] = (summary.by_control[item.control_id] || 0) + 1;

        // Separate file vs metadata evidence
        if (item.file_path) {
          summary.file_evidence.push({
            id: item.id,
            title: item.title,
            type: item.evidence_type,
            control_id: item.control_id,
            collected_at: item.collected_at,
            file_size: item.metadata?.file_size
          });
        } else {
          summary.metadata_evidence.push({
            id: item.id,
            title: item.title,
            type: item.evidence_type,
            control_id: item.control_id,
            collected_at: item.collected_at
          });
        }

        // Recent evidence (last 10 items)
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

    } catch (error) {
      console.error('Error getting evidence summary:', error);
      throw error;
    }
  }

  async searchEvidence(frameworkId, searchTerm, filters = {}) {
    try {
      let evidence = await this.db.getEvidenceByFramework(frameworkId);

      // Apply text search
      if (searchTerm) {
        const term = searchTerm.toLowerCase();
        evidence = evidence.filter(item =>
          item.title.toLowerCase().includes(term) ||
          item.description.toLowerCase().includes(term) ||
          (item.metadata && JSON.stringify(item.metadata).toLowerCase().includes(term))
        );
      }

      // Apply filters
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

    } catch (error) {
      console.error('Error searching evidence:', error);
      throw error;
    }
  }

  async exportEvidence(frameworkId, format = 'json') {
    try {
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
          item.description,
          item.collected_at,
          item.file_path || 'N/A'
        ]);

        const csvContent = [headers, ...rows]
          .map(row => row.map(field => `"${field}"`).join(','))
          .join('\n');

        return csvContent;
      }

      throw new Error(`Unsupported export format: ${format}`);

    } catch (error) {
      console.error('Error exporting evidence:', error);
      throw error;
    }
  }

  async deleteEvidence(evidenceId) {
    try {
      // Get evidence details first
      const evidence = await this.getEvidenceById(evidenceId);

      if (!evidence) {
        throw new Error('Evidence not found');
      }

      // Delete associated file if exists
      if (evidence.file_path && fs.existsSync(evidence.file_path)) {
        fs.unlinkSync(evidence.file_path);
      }

      // Delete from database (this would need to be implemented in the database class)
      // await this.db.deleteEvidence(evidenceId);

      // Log the deletion
      await this.db.logAudit(
        'DELETE',
        'evidence_items',
        evidenceId,
        evidence,
        null
      );

      return true;

    } catch (error) {
      console.error('Error deleting evidence:', error);
      throw error;
    }
  }

  async getEvidenceById(evidenceId) {
    // This would need to be implemented in the database class
    // For now, return null
    return null;
  }
}

module.exports = LocalEvidenceProcessor;