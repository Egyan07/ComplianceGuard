const { app, BrowserWindow, Tray, Menu, Notification, ipcMain, dialog } = require('electron');
const path = require('path');
const fs = require('fs');

// Local processing modules
const ComplianceGuardDatabase = require('./database/sqlite');
const LocalEvidenceProcessor = require('./processing/evidence-processor');
const LocalComplianceEngine = require('./processing/compliance-engine');
const ReportGenerator = require('./processing/report-generator');
const LicenseManager = require('./licensing/license-manager');
const { collectWindowsEvidence } = require('./system/windows');

// Keep a global reference of the window object
let mainWindow = null;
let tray = null;

// Local processing instances
let database = null;
let evidenceProcessor = null;
let complianceEngine = null;
let reportGenerator = null;
let licenseManager = null;

// Development mode flag
const isDev = process.env.NODE_ENV === 'development' || !app.isPackaged;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 800,
    minHeight: 600,
    backgroundColor: '#ffffff',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false
    },
    icon: path.join(__dirname, '../resources/icons/icon.ico')
  });

  if (isDev) {
    // Match the vite.config.ts port (5173)
    mainWindow.loadURL('http://localhost:5173');
    mainWindow.webContents.openDevTools();
  } else {
    mainWindow.loadFile(path.join(__dirname, '../frontend/dist/index.html'));
  }

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

function createTray() {
  const iconPath = path.join(__dirname, '../resources/icons/tray-icon.png');

  // Only create tray if icon exists
  if (!fs.existsSync(iconPath)) {
    console.warn('Tray icon not found at:', iconPath, '- skipping tray creation');
    return;
  }

  tray = new Tray(iconPath);

  const contextMenu = Menu.buildFromTemplate([
    {
      label: 'Show Dashboard',
      click: () => {
        if (mainWindow) {
          mainWindow.show();
          mainWindow.focus();
        }
      }
    },
    {
      label: 'Collect Evidence',
      click: () => {
        if (mainWindow) {
          mainWindow.webContents.send('collect-evidence');
        }
      }
    },
    { type: 'separator' },
    {
      label: 'Exit',
      click: () => {
        app.quit();
      }
    }
  ]);

  tray.setToolTip('ComplianceGuard - SOC 2 Automation');
  tray.setContextMenu(contextMenu);

  tray.on('click', () => {
    if (mainWindow) {
      if (mainWindow.isVisible()) {
        mainWindow.hide();
      } else {
        mainWindow.show();
        mainWindow.focus();
      }
    }
  });
}

function showNotification(title, body) {
  if (!Notification.isSupported()) return;

  const notification = new Notification({
    title: title,
    body: body
  });
  notification.show();
}

// ---- IPC Handlers ----

ipcMain.handle('get-app-version', () => {
  return app.getVersion();
});

ipcMain.handle('show-notification', (event, title, body) => {
  showNotification(title, body);
});

ipcMain.handle('get-system-info', () => {
  return {
    platform: process.platform,
    arch: process.arch,
    version: process.version,
    electronVersion: process.versions.electron
  };
});

// File dialog for selecting a folder
ipcMain.handle('select-folder', async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    properties: ['openDirectory']
  });
  if (result.canceled) return null;
  return result.filePaths[0];
});

// File picker for evidence upload
ipcMain.handle('select-evidence-file', async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
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
  const result = await dialog.showSaveDialog(mainWindow, {
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
ipcMain.handle('collect-windows-evidence', async (event, frameworkId = 1) => {
  try {
    console.log('Starting Windows evidence collection...');
    const windowsEvidence = await collectWindowsEvidence();

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
    console.error('Windows evidence collection failed:', error);
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
    console.error('Manual evidence processing failed:', error);
    return { error: error.message };
  }
});

// Compliance evaluation
ipcMain.handle('evaluate-compliance', async (event, frameworkId = 1) => {
  try {
    console.log('Starting compliance evaluation...');
    const evaluation = await complianceEngine.evaluateCompliance(frameworkId);

    showNotification(
      'Compliance Evaluation Complete',
      `Overall Score: ${evaluation.overall_score.toFixed(1)}% - Status: ${evaluation.status}`
    );

    return evaluation;
  } catch (error) {
    console.error('Compliance evaluation failed:', error);
    return { error: error.message };
  }
});

// Evidence summary
ipcMain.handle('get-evidence-summary', async (event, frameworkId = 1) => {
  try {
    return await evidenceProcessor.getEvidenceSummary(frameworkId);
  } catch (error) {
    console.error('Evidence summary failed:', error);
    return { error: error.message };
  }
});

// Get all evidence for a framework
ipcMain.handle('get-evidence-list', async (event, frameworkId = 1) => {
  try {
    return await database.getEvidenceByFramework(frameworkId);
  } catch (error) {
    console.error('Get evidence list failed:', error);
    return { error: error.message };
  }
});

// Compliance report generation
ipcMain.handle('generate-compliance-report', async (event, frameworkId = 1, format = 'detailed') => {
  try {
    return await complianceEngine.generateComplianceReport(frameworkId, format);
  } catch (error) {
    console.error('Report generation failed:', error);
    return { error: error.message };
  }
});

// Export compliance report as PDF (Pro only)
ipcMain.handle('export-pdf-report', async (event, frameworkId = 1) => {
  if (!licenseManager.isFeatureAllowed('pdf_reports')) {
    return { error: 'PDF reports require a Pro license.', upgrade_required: true };
  }
  try {
    // Generate HTML report
    const html = await reportGenerator.generateHTMLReport(frameworkId);

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
    const result = await dialog.showSaveDialog(mainWindow, {
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
    console.error('PDF export failed:', error);
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
    console.error('Get evaluation history failed:', error);
    return { error: error.message };
  }
});

// ---- License Management IPC ----

ipcMain.handle('get-license-info', async () => {
  return licenseManager.getLicenseInfo();
});

ipcMain.handle('activate-license', async (event, keyString) => {
  try {
    const result = await licenseManager.activateLicense(keyString);
    if (result.valid) {
      mainWindow?.webContents.send('license-changed', licenseManager.getLicenseInfo());
    }
    return result;
  } catch (error) {
    return { valid: false, error: error.message };
  }
});

ipcMain.handle('deactivate-license', async () => {
  await licenseManager.deactivateLicense();
  mainWindow?.webContents.send('license-changed', licenseManager.getLicenseInfo());
  return { success: true };
});

ipcMain.handle('check-feature', async (event, featureName) => {
  return licenseManager.isFeatureAllowed(featureName);
});

// Evidence search
ipcMain.handle('search-evidence', async (event, frameworkId = 1, searchTerm, filters = {}) => {
  try {
    return await evidenceProcessor.searchEvidence(frameworkId, searchTerm, filters);
  } catch (error) {
    console.error('Evidence search failed:', error);
    return { error: error.message };
  }
});

// User settings
ipcMain.handle('get-user-setting', async (event, key, defaultValue = null) => {
  try {
    return await database.getUserSetting(key, defaultValue);
  } catch (error) {
    console.error('Get user setting failed:', error);
    return defaultValue;
  }
});

ipcMain.handle('set-user-setting', async (event, key, value, type = 'string') => {
  try {
    await database.setUserSetting(key, value, type);
    return { success: true };
  } catch (error) {
    console.error('Set user setting failed:', error);
    return { error: error.message };
  }
});

// Database backup
ipcMain.handle('create-database-backup', async () => {
  try {
    const backupPath = await database.backup();
    showNotification('Database Backup Created', `Backup saved to: ${backupPath}`);
    return { success: true, backup_path: backupPath };
  } catch (error) {
    console.error('Database backup failed:', error);
    return { error: error.message };
  }
});

// ---- App Lifecycle ----

app.whenReady().then(async () => {
  try {
    console.log('Initializing ComplianceGuard...');

    database = new ComplianceGuardDatabase();
    await database.initialize(app.getPath('userData'));

    licenseManager = new LicenseManager(database);
    await licenseManager.initialize();

    evidenceProcessor = new LocalEvidenceProcessor(database, app.getPath('userData'));
    complianceEngine = new LocalComplianceEngine(database, licenseManager);
    reportGenerator = new ReportGenerator(database);

    console.log('Database and processing engines initialized');

    createWindow();
    createTray();

    setTimeout(() => {
      showNotification(
        'ComplianceGuard Started',
        'SOC 2 automation is now running'
      );
    }, 2000);

  } catch (error) {
    console.error('Failed to initialize ComplianceGuard:', error);
    showNotification(
      'ComplianceGuard Error',
      'Failed to initialize. Please restart the application.'
    );
  }
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('activate', () => {
  if (mainWindow === null) {
    createWindow();
  }
});

app.on('before-quit', async () => {
  if (database) {
    try {
      await database.close();
    } catch (error) {
      console.error('Error closing database:', error);
    }
  }
});

// Security: Prevent navigation to external sites
app.on('web-contents-created', (event, contents) => {
  contents.on('will-navigate', (navEvent, navigationUrl) => {
    const parsedUrl = new URL(navigationUrl);
    const allowedOrigins = ['http://localhost:5173', 'file://'];
    if (!allowedOrigins.some(origin => parsedUrl.href.startsWith(origin))) {
      navEvent.preventDefault();
    }
  });

  contents.setWindowOpenHandler(() => {
    return { action: 'deny' };
  });
});
