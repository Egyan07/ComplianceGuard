const { ipcMain, dialog, BrowserWindow } = require('electron');
const log = require('../logger');
const path = require('path');
const fs = require('fs');
const { logAuditEvent } = require('../processing/audit-service');
const REMEDIATION_SCRIPTS = require('../processing/remediation-scripts');

/**
 * Compliance IPC handlers: evaluation, history, PDF export, remediation scripts.
 */
function registerComplianceHandlers(ctx) {
  const { database, reportGenerator, licenseManager, showNotification } = ctx;

  // Compliance evaluation
  ipcMain.handle('evaluate-compliance', async (event, frameworkId = 1) => {
    try {
      log.info('Starting compliance evaluation...');
      // Phase 5: the canonical engine (shared-framework coverage scoring) is
      // the single scoring path.
      const evidence = await database.getAllEvidence();
      const evidenceTypes = evidence.map((item) => item.evidence_type);
      const evaluation = await ctx.canonicalEngine.evaluateAndPersist(frameworkId, evidenceTypes, database);

      showNotification(
        'Compliance Evaluation Complete',
        `Overall Score: ${evaluation.overall_score.toFixed(1)}% - Status: ${evaluation.status}`
      );

      return evaluation;
    } catch (error) {
      log.error('Compliance evaluation failed:', error);
      return { error: error.message };
    }
  });

  // Export compliance report as PDF (Pro only)
  ipcMain.handle('export-pdf-report', async (event, frameworkId = 1) => {
    if (!licenseManager.isFeatureAllowed('pdf_reports')) {
      return { error: 'PDF reports require a Pro license.', upgrade_required: true };
    }
    try {
      // Load enterprise branding config if license allows
      let brandingConfig = null;
      if (licenseManager.isFeatureAllowed('enterprise_pdf_branding')) {
        const cfg = database.db.prepare('SELECT * FROM enterprise_config LIMIT 1').get();
        if (cfg) {
          // The local config stores the logo as a file path; read + base64-encode it for the report.
          let logoBase64 = null;
          if (cfg.logo_path) {
            try {
              logoBase64 = fs.readFileSync(cfg.logo_path).toString('base64');
            } catch (err) {
              log.warn('Could not read enterprise logo at', cfg.logo_path, '-', err.message);
            }
          }
          brandingConfig = {
            companyName: cfg.company_name,
            reportFooter: cfg.report_footer,
            logoBase64,
            systemDescription: cfg.system_description || null,
            reportType: cfg.report_type || null,
            periodStart: cfg.period_start || null,
            periodEnd: cfg.period_end || null,
          };
        }
      }

      // Generate HTML report
      const html = await reportGenerator.generateHTMLReport(frameworkId, brandingConfig);

      // Create a hidden window to render the HTML
      const reportWindow = new BrowserWindow({
        show: false,
        width: 900,
        height: 1200,
        webPreferences: { contextIsolation: true, nodeIntegration: false }
      });

      await new Promise((resolve, reject) => {
        reportWindow.webContents.once('did-finish-load', resolve);
        reportWindow.webContents.once('did-fail-load', (_event, errorCode, errorDescription) => {
          reportWindow.destroy();
          reject(new Error(`Report render failed: ${errorDescription} (${errorCode})`));
        });
        reportWindow.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(html));
      });

      // Generate PDF
      const pdfBuffer = await reportWindow.webContents.printToPDF({
        printBackground: true,
        paperWidth: 8.5,
        paperHeight: 11,
        margins: { top: 0, bottom: 0, left: 0, right: 0 }
      });

      reportWindow.close();

      // Ask user where to save
      const result = await dialog.showSaveDialog(ctx.getMainWindow(), {
        defaultPath: `ComplianceGuard-Report-${new Date().toISOString().split('T')[0]}.pdf`,
        filters: [{ name: 'PDF Files', extensions: ['pdf'] }]
      });

      if (result.canceled || !result.filePath) {
        return { success: false, cancelled: true };
      }

      fs.writeFileSync(result.filePath, pdfBuffer);

      showNotification('Report Exported', `PDF saved to ${path.basename(result.filePath)}`);

      return { success: true, filePath: result.filePath };
    } catch (error) {
      log.error('PDF export failed:', error);
      return { error: error.message };
    }
  });

  // Evaluation history (Pro only)
  ipcMain.handle('get-evaluation-history', async (event, frameworkId = 1) => {
    if (!licenseManager.isFeatureAllowed('evaluation_history')) {
      return { error: 'Evaluation history requires a Pro license.', upgrade_required: true };
    }
    try {
      return await database.getEvaluationHistory(frameworkId);
    } catch (error) {
      log.error('Get evaluation history failed:', error);
      return { error: error.message };
    }
  });

  // Remediation script download — Control Heatmap feature
  ipcMain.handle('download-remediation-script', async (event, controlId) => {
    try {
      const entry = REMEDIATION_SCRIPTS[controlId];
      if (!entry || entry.type !== 'script') {
        return { error: `No PowerShell script available for control ${controlId}` };
      }

      const { filePath, canceled } = await dialog.showSaveDialog(ctx.getMainWindow(), {
        title: `Download Remediation Script — ${controlId}`,
        defaultPath: `fix-${controlId}.ps1`,
        filters: [{ name: 'PowerShell Script', extensions: ['ps1'] }],
      });

      if (canceled || !filePath) return { canceled: true };

      const scriptContent = entry.scriptLines.join('\n') + '\n';
      fs.writeFileSync(filePath, scriptContent, 'utf8');

      // Audit event — store basename only (never log full path: may contain username/machine name)
      try {
        if (licenseManager.isFeatureAllowed('enterprise_audit_log')) {
          logAuditEvent(database.db, 'remediation_script_downloaded', {
            detail: { control_id: controlId, file_name: path.basename(filePath) },
          });
        }
      } catch (e) { log.error('audit log failed for remediation_script_downloaded:', e); }

      return { success: true, file_name: path.basename(filePath) };
    } catch (error) {
      log.error('download-remediation-script failed:', error);
      return { error: error.message };
    }
  });
}

module.exports = registerComplianceHandlers;
