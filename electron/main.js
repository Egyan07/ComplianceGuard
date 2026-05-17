const { app, BrowserWindow, Tray, Menu, Notification, ipcMain, dialog } = require('electron');
const log = require('./logger');
const path = require('path');
const fs = require('fs');
const yaml = require('js-yaml');

// Local processing modules
const ComplianceGuardDatabase = require('./database/sqlite');
const LocalEvidenceProcessor = require('./processing/evidence-processor');
const LocalComplianceEngine = require('./processing/compliance-engine');
const ReportGenerator = require('./processing/report-generator');
const LicenseManager = require('./licensing/license-manager');
const CloudSync = require('./cloud-sync');
const { collectWindowsEvidence } = require('./system/windows');
const scheduler = require('./scheduler');
const { z } = require('zod');
const { logAuditEvent } = require('./processing/audit-service');

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
const isDev = !app.isPackaged;

// ---- Framework Reference Browser ----
const frameworkCache = new Map();
const FRAMEWORK_FILES = {
  1: { name: 'SOC 2', file: 'soc2_controls.yaml' },
  2: { name: 'ISO 27001', file: 'iso27001_controls.yaml' },
  3: { name: 'HIPAA', file: 'hipaa_controls.yaml' },
};

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
    mainWindow.loadFile(path.join(app.getAppPath(), 'frontend', 'dist', 'index.html'));
  }

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

function createTray() {
  const iconPath = path.join(__dirname, '../resources/icons/tray-icon.png');

  // Only create tray if icon exists
  if (!fs.existsSync(iconPath)) {
    log.warn('Tray icon not found at:', iconPath, '- skipping tray creation');
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
    log.info('Starting Windows evidence collection...');
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

// Compliance evaluation
ipcMain.handle('evaluate-compliance', async (event, frameworkId = 1) => {
  try {
    log.info('Starting compliance evaluation...');
    const evaluation = await complianceEngine.evaluateCompliance(frameworkId);

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

// Compliance report generation
ipcMain.handle('generate-compliance-report', async (event, frameworkId = 1, format = 'detailed') => {
  try {
    return await complianceEngine.generateComplianceReport(frameworkId, format);
  } catch (error) {
    log.error('Report generation failed:', error);
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
    log.error('Evidence search failed:', error);
    return { error: error.message };
  }
});

// User settings
ipcMain.handle('get-user-setting', async (event, key, defaultValue = null) => {
  try {
    return await database.getUserSetting(key, defaultValue);
  } catch (error) {
    log.error('Get user setting failed:', error);
    return defaultValue;
  }
});

ipcMain.handle('set-user-setting', async (event, key, value, type = 'string') => {
  try {
    await database.setUserSetting(key, value, type);
    return { success: true };
  } catch (error) {
    log.error('Set user setting failed:', error);
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
    log.error('Database backup failed:', error);
    return { error: error.message };
  }
});

ipcMain.handle('cloud-connect', async (event, serverUrl, email, password) => {
  return await CloudSync.cloudConnect(database, serverUrl, email, password);
});

ipcMain.handle('cloud-sync', async (event, syncData) => {
  return await CloudSync.cloudSync(database, syncData);
});

ipcMain.handle('cloud-get-config', async () => {
  return await CloudSync.getCloudConfig(database);
});

ipcMain.handle('cloud-disconnect', async () => {
  return await CloudSync.clearCloudConfig(database);
});

// Framework reference browser
ipcMain.handle('get-framework-controls', (event, frameworkId) => {
  if (frameworkCache.has(frameworkId)) {
    return frameworkCache.get(frameworkId);
  }
  const meta = FRAMEWORK_FILES[frameworkId];
  if (!meta) {
    return { error: `Unknown framework ID: ${frameworkId}` };
  }
  try {
    const filePath = path.join(__dirname, 'data', meta.file);
    const raw = fs.readFileSync(filePath, 'utf8');
    const parsed = yaml.load(raw);
    const controls = parsed.controls.map(c => ({
      id: c.id,
      title: c.title,
      description: c.description,
      category: c.category,
      control_objective: c.control_objective,
      implementation_guidance: c.implementation_guidance,
      risk_level: c.risk_level ?? 'medium',
      ...(c.specification_type !== undefined && { specification_type: c.specification_type }),
      ...(c.related_controls !== undefined && { related_controls: c.related_controls }),
    }));
    const result = { frameworkId, name: meta.name, controls };
    frameworkCache.set(frameworkId, result);
    return result;
  } catch (error) {
    log.error(`Failed to load framework ${frameworkId}:`, error);
    return { error: error.message };
  }
});

// ---- Schedule IPC ----

ipcMain.handle('get-schedule', async () => {
  try {
    const task = await database.getScheduleTask();
    if (!task) return { config: { enabled: false, frequency: 'daily', time: '09:00' }, last_run_at: null, next_run_at: null, last_result: null };
    return {
      config: JSON.parse(task.schedule_config_json),
      last_run_at: task.last_run_at,
      next_run_at: task.next_run_at,
      last_result: task.last_result_json ? JSON.parse(task.last_result_json) : null,
    };
  } catch (err) {
    log.error('get-schedule failed:', err);
    return { error: err.message };
  }
});

ipcMain.handle('set-schedule', async (event, config) => {
  try {
    const { enabled, frequency, time } = config;
    if (typeof enabled !== 'boolean') return { error: 'Invalid enabled flag' };
    if (!['daily', 'weekly'].includes(frequency)) return { error: 'Invalid frequency' };
    if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(time)) return { error: 'Invalid time format' };
    const nextRunAt = enabled ? scheduler.calcNextRunAt(config) : null;
    await database.updateScheduleConfig(config, nextRunAt);
    return { config, next_run_at: nextRunAt };
  } catch (err) {
    log.error('set-schedule failed:', err);
    return { error: err.message };
  }
});

ipcMain.handle('run-collection-now', async () => {
  try {
    const result = await scheduler.runCollection();
    return result;
  } catch (err) {
    log.error('run-collection-now failed:', err);
    return { error: err.message };
  }
});

// Enterprise: get branding config
ipcMain.handle('get-enterprise-config', async () => {
  try {
    if (!licenseManager.isFeatureAllowed('enterprise_pdf_branding')) {
      return { error: 'Enterprise license required.' };
    }
    const row = database.db.prepare('SELECT * FROM enterprise_config LIMIT 1').get();
    return row || { company_name: null, logo_path: null, report_footer: null };
  } catch (error) {
    log.error('get-enterprise-config failed:', error);
    return { error: error.message };
  }
});

// Enterprise: set branding config
const _brandingSchema = z.object({
  company_name: z.string().min(1).max(200),
  logo_path: z.string().max(500).nullable().optional(),
  report_footer: z.string().max(500).nullable().optional(),
});

ipcMain.handle('set-enterprise-config', async (event, payload) => {
  try {
    if (!licenseManager.isFeatureAllowed('enterprise_pdf_branding')) {
      return { error: 'Enterprise license required.' };
    }
    const parsed = _brandingSchema.safeParse(payload);
    if (!parsed.success) {
      return { error: 'Invalid config: ' + parsed.error.message };
    }
    const { company_name, logo_path, report_footer } = parsed.data;
    const existing = database.db.prepare('SELECT id FROM enterprise_config LIMIT 1').get();
    if (existing) {
      database.db.prepare('UPDATE enterprise_config SET company_name=?, logo_path=?, report_footer=?, updated_at=datetime("now") WHERE id=?')
        .run(company_name, logo_path ?? null, report_footer ?? null, existing.id);
    } else {
      database.db.prepare('INSERT INTO enterprise_config (company_name, logo_path, report_footer) VALUES (?,?,?)')
        .run(company_name, logo_path ?? null, report_footer ?? null);
    }
    logAuditEvent(database.db, 'enterprise_config_updated', { detail: { company_name } });
    return { success: true };
  } catch (error) {
    log.error('set-enterprise-config failed:', error);
    return { error: error.message };
  }
});

// Enterprise: get audit log (paginated)
const _auditQuerySchema = z.object({
  page: z.number().int().min(1).default(1),
  pageSize: z.number().int().min(1).max(200).default(50),
  eventType: z.string().optional(),
});

ipcMain.handle('get-audit-log', async (event, params) => {
  try {
    if (!licenseManager.isFeatureAllowed('enterprise_audit_log')) {
      return { error: 'Enterprise license required.' };
    }
    const parsed = _auditQuerySchema.safeParse(params || {});
    if (!parsed.success) {
      return { error: 'Invalid params: ' + parsed.error.message };
    }
    const { page, pageSize, eventType } = parsed.data;
    const offset = (page - 1) * pageSize;
    const rows = eventType
      ? database.db.prepare('SELECT * FROM enterprise_audit_log WHERE event_type = ? ORDER BY id ASC LIMIT ? OFFSET ?').all(eventType, pageSize, offset)
      : database.db.prepare('SELECT * FROM enterprise_audit_log ORDER BY id ASC LIMIT ? OFFSET ?').all(pageSize, offset);
    const total = eventType
      ? database.db.prepare('SELECT COUNT(*) as n FROM enterprise_audit_log WHERE event_type = ?').get(eventType).n
      : database.db.prepare('SELECT COUNT(*) as n FROM enterprise_audit_log').get().n;
    return { total, page, pageSize, entries: rows };
  } catch (error) {
    log.error('get-audit-log failed:', error);
    return { error: error.message };
  }
});

// Enterprise: export data as NDJSON to file chosen via system dialog
ipcMain.handle('export-data', async () => {
  try {
    if (!licenseManager.isFeatureAllowed('enterprise_data_export')) {
      return { error: 'Enterprise license required.' };
    }
    // Path comes from dialog — not from renderer input (prevents path injection)
    const { filePath, canceled } = await dialog.showSaveDialog(mainWindow, {
      title: 'Export Compliance Data',
      defaultPath: `complianceguard-export-${Date.now()}.ndjson`,
      filters: [{ name: 'NDJSON', extensions: ['ndjson'] }],
    });
    if (canceled || !filePath) return { canceled: true };

    const stream = fs.createWriteStream(filePath, { encoding: 'utf8' });
    const write = (obj) => { stream.write(JSON.stringify(obj) + '\n'); };

    write({ type: 'section', name: 'evidence' });
    for (const row of database.db.prepare('SELECT * FROM evidence_items ORDER BY id ASC').all()) {
      write({ type: 'evidence', ...row });
    }
    write({ type: 'section', name: 'evaluations' });
    for (const row of database.db.prepare('SELECT * FROM evaluations ORDER BY id ASC').all()) {
      write({ type: 'evaluation', ...row });
    }
    write({ type: 'section', name: 'enterprise_audit_log' });
    for (const row of database.db.prepare('SELECT * FROM enterprise_audit_log ORDER BY id ASC').all()) {
      write({ type: 'enterprise_audit_log', ...row });
    }

    await new Promise((resolve, reject) => { stream.end(resolve); stream.on('error', reject); });
    logAuditEvent(database.db, 'export_generated', { detail: { file_path: filePath } });
    return { success: true, file_path: filePath };
  } catch (error) {
    log.error('export-data failed:', error);
    return { error: error.message };
  }
});

// ---- App Lifecycle ----

app.whenReady().then(async () => {
  try {
    log.info('Initializing ComplianceGuard...');

    database = new ComplianceGuardDatabase();
    await database.initialize(app.getPath('userData'));

    licenseManager = new LicenseManager(database);
    await licenseManager.initialize();

    evidenceProcessor = new LocalEvidenceProcessor(database, app.getPath('userData'));
    complianceEngine = new LocalComplianceEngine(database, licenseManager);
    reportGenerator = new ReportGenerator(database);

    log.info('Database and processing engines initialized');

    await scheduler.start(database, evidenceProcessor);

    createWindow();
    createTray();

    setTimeout(() => {
      showNotification(
        'ComplianceGuard Started',
        'SOC 2 automation is now running'
      );
    }, 2000);

  } catch (error) {
    log.error('Failed to initialize ComplianceGuard:', error);
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
      log.error('Error closing database:', error);
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
