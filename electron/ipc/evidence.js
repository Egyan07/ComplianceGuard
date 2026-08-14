const { ipcMain, dialog } = require('electron');
const log = require('../logger');
const path = require('path');
const fs = require('fs');
const { collectEvidence } = require('../system/collector');

/**
 * Evidence-related IPC handlers: collection, queries, search, file dialogs.
 */
function registerEvidenceHandlers(ctx) {
  const { database, evidenceProcessor, licenseManager, showNotification } = ctx;

  // File dialog for selecting a folder
  ipcMain.handle('select-folder', async () => {
    const result = await dialog.showOpenDialog(ctx.getMainWindow(), {
      properties: ['openDirectory']
    });
    if (result.canceled) return null;
    return result.filePaths[0];
  });

  // File picker for evidence upload
  ipcMain.handle('select-evidence-file', async () => {
    const result = await dialog.showOpenDialog(ctx.getMainWindow(), {
      properties: ['openFile'],
      filters: [
        { name: 'Documents', extensions: ['pdf', 'doc', 'docx', 'txt', 'csv', 'json', 'xlsx', 'xls'] },
        { name: 'Images', extensions: ['png', 'jpg', 'jpeg', 'gif', 'bmp'] },
        { name: 'All Files', extensions: ['*'] }
      ]
    });

    if (result.canceled || !result.filePaths[0]) return null;

    const filePath = result.filePaths[0];
    const fileName = path.basename(filePath);
    const fileBuffer = fs.readFileSync(filePath);

    return {
      fileName,
      filePath,
      fileSize: fileBuffer.length,
      fileData: fileBuffer.toString('base64')
    };
  });

  // Save report to file
  ipcMain.handle('save-report', async (event, data, filename) => {
    const result = await dialog.showSaveDialog(ctx.getMainWindow(), {
      defaultPath: filename || 'compliance-report.json',
      filters: [
        { name: 'JSON Files', extensions: ['json'] },
        { name: 'All Files', extensions: ['*'] }
      ]
    });

    if (result.canceled || !result.filePath) return null;

    const content = typeof data === 'string' ? data : JSON.stringify(data, null, 2);
    fs.writeFileSync(result.filePath, content, 'utf8');
    return result.filePath;
  });

  // Windows evidence collection
  // TODO: rename to 'collect-evidence' in next breaking release (touches preload.js + api.ts + tests)
  ipcMain.handle('collect-windows-evidence', async (event, frameworkId = 1) => {
    try {
      log.info('Starting evidence collection...');
      const windowsEvidence = await collectEvidence();

      const processedEvidence = await evidenceProcessor.processWindowsEvidence(windowsEvidence, frameworkId);

      showNotification(
        'Evidence Collection Complete',
        `Collected ${processedEvidence.length} evidence items`
      );

      return {
        success: true,
        evidence_count: processedEvidence.length,
        windows_evidence: windowsEvidence
      };
    } catch (error) {
      log.error('Windows evidence collection failed:', error);
      showNotification('Evidence Collection Failed', error.message);
      return { error: error.message };
    }
  });

  // Manual evidence processing (Pro only)
  ipcMain.handle('process-manual-evidence', async (event, evidenceData, frameworkId = 1) => {
    if (!licenseManager.isFeatureAllowed('evidence_upload')) {
      return { error: 'Evidence upload requires a Pro license.', upgrade_required: true };
    }
    try {
      const evidenceId = await evidenceProcessor.processManualEvidence(evidenceData, frameworkId);
      return { success: true, evidence_id: evidenceId };
    } catch (error) {
      log.error('Manual evidence processing failed:', error);
      return { error: error.message };
    }
  });

  // Evidence summary
  ipcMain.handle('get-evidence-summary', async (event, frameworkId = 1) => {
    try {
      return await evidenceProcessor.getEvidenceSummary(frameworkId);
    } catch (error) {
      log.error('Evidence summary failed:', error);
      return { error: error.message };
    }
  });

  // Get all evidence for a framework
  ipcMain.handle('get-evidence-list', async (event, frameworkId = 1) => {
    try {
      return await database.getEvidenceByFramework(frameworkId);
    } catch (error) {
      log.error('Get evidence list failed:', error);
      return { error: error.message };
    }
  });

  // Evidence search
  ipcMain.handle('search-evidence', async (event, frameworkId = 1, searchTerm, filters = {}) => {
    try {
      return await evidenceProcessor.searchEvidence(frameworkId, searchTerm, filters);
    } catch (error) {
      log.error('Evidence search failed:', error);
      return { error: error.message };
    }
  });
}

module.exports = registerEvidenceHandlers;
