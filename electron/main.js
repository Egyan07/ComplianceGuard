const { app, BrowserWindow, Tray, Menu, Notification, ipcMain } = require('electron');
const path = require('path');
const url = require('url');

// Local processing modules
const ComplianceGuardDatabase = require('./database/sqlite');
const LocalEvidenceProcessor = require('./processing/evidence-processor');
const LocalComplianceEngine = require('./processing/compliance-engine');
const { collectWindowsEvidence } = require('./system/windows');

// Keep a global reference of the window object
let mainWindow = null;
let tray = null;

// Local processing instances
let database = null;
let evidenceProcessor = null;
let complianceEngine = null;

// Development mode flag
const isDev = process.env.NODE_ENV === 'development' || !app.isPackaged;

function createWindow() {
  // Create the browser window
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 800,
    minHeight: 600,
    backgroundColor: '#ffffff',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      enableRemoteModule: false,
      worldSafeExecuteJavaScript: true
    },
    icon: path.join(__dirname, '../resources/icons/icon.ico')
  });

  // Load the app
  if (isDev) {
    // In development, load from React dev server
    mainWindow.loadURL('http://localhost:3000');
    mainWindow.webContents.openDevTools();
  } else {
    // In production, load built React app
    mainWindow.loadURL(
      url.format({
        pathname: path.join(__dirname, '../frontend/build/index.html'),
        protocol: 'file:',
        slashes: true
      })
    );
  }

  // Handle window events
  mainWindow.on('closed', () => {
    mainWindow = null;
  });

  mainWindow.on('minimize', (event) => {
    // Option to minimize to tray instead of taskbar
    // event.preventDefault();
    // mainWindow.hide();
  });
}

function createTray() {
  const iconPath = path.join(__dirname, '../resources/icons/tray-icon.png');

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
    {
      type: 'separator'
    },
    {
      label: 'Compliance Status: Good',
      enabled: false
    },
    {
      type: 'separator'
    },
    {
      label: 'Exit',
      click: () => {
        app.quit();
      }
    }
  ]);

  tray.setToolTip('ComplianceGuard - SOC 2 Automation');
  tray.setContextMenu(contextMenu);

  // Show window on tray icon click
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
  const notification = new Notification({
    title: title,
    body: body,
    icon: path.join(__dirname, '../resources/icons/notification-icon.png')
  });

  notification.show();
}

// IPC handlers for communication between renderer and main processes
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

// Windows-specific evidence collection with local processing
ipcMain.handle('collect-windows-evidence', async (event, frameworkId = 1) => {
  try {
    console.log('Starting Windows evidence collection...');
    const windowsEvidence = await collectWindowsEvidence();

    // Process evidence locally
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
    showNotification(
      'Evidence Collection Failed',
      error.message
    );
    return { error: error.message };
  }
});

// Local evidence processing
ipcMain.handle('process-manual-evidence', async (event, evidenceData, frameworkId = 1) => {
  try {
    const processedEvidence = await evidenceProcessor.processManualEvidence(evidenceData, frameworkId);
    return { success: true, evidence_id: processedEvidence };
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
    const summary = await evidenceProcessor.getEvidenceSummary(frameworkId);
    return summary;
  } catch (error) {
    console.error('Evidence summary failed:', error);
    return { error: error.message };
  }
});

// Compliance report generation
ipcMain.handle('generate-compliance-report', async (event, frameworkId = 1, format = 'detailed') => {
  try {
    const report = await complianceEngine.generateComplianceReport(frameworkId, format);
    return report;
  } catch (error) {
    console.error('Report generation failed:', error);
    return { error: error.message };
  }
});

// Evidence search
ipcMain.handle('search-evidence', async (event, frameworkId = 1, searchTerm, filters = {}) => {
  try {
    const results = await evidenceProcessor.searchEvidence(frameworkId, searchTerm, filters);
    return results;
  } catch (error) {
    console.error('Evidence search failed:', error);
    return { error: error.message };
  }
});

// User settings
ipcMain.handle('get-user-setting', async (event, key, defaultValue = null) => {
  try {
    const value = await database.getUserSetting(key, defaultValue);
    return value;
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

// Database maintenance
ipcMain.handle('create-database-backup', async () => {
  try {
    const backupPath = await database.backup();
    showNotification(
      'Database Backup Created',
      `Backup saved to: ${backupPath}`
    );
    return { success: true, backup_path: backupPath };
  } catch (error) {
    console.error('Database backup failed:', error);
    return { error: error.message };
  }
});

// App event handlers
app.whenReady().then(async () => {
  try {
    // Initialize local database and processing engines
    console.log('Initializing ComplianceGuard database...');
    database = new ComplianceGuardDatabase();
    await database.initialize();

    evidenceProcessor = new LocalEvidenceProcessor(database);
    complianceEngine = new LocalComplianceEngine(database);

    console.log('Database and processing engines initialized successfully');

    createWindow();
    createTray();

    // Show welcome notification
    setTimeout(() => {
      showNotification(
        'ComplianceGuard Started',
        'SOC 2 automation is now running in the background'
      );
    }, 2000);

  } catch (error) {
    console.error('Failed to initialize ComplianceGuard:', error);
    showNotification(
      'ComplianceGuard Error',
      'Failed to initialize local database. Please restart the application.'
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

// Security: Prevent navigation to external sites
app.on('web-contents-created', (event, contents) => {
  contents.on('will-navigate', (event, navigationUrl) => {
    const parsedUrl = new URL(navigationUrl);
    if (parsedUrl.origin !== 'http://localhost:3000' && !app.isPackaged) {
      event.preventDefault();
    }
  });

  contents.on('new-window', (event, navigationUrl) => {
    event.preventDefault();
  });
});

// Auto-updater setup (for production)
if (!isDev) {
  const { autoUpdater } = require('electron-updater');

  autoUpdater.on('update-available', () => {
    showNotification('Update Available', 'A new version of ComplianceGuard is available');
  });

  autoUpdater.on('update-downloaded', () => {
    showNotification('Update Ready', 'Restart ComplianceGuard to apply the update');
  });

  // Check for updates periodically
  setInterval(() => {
    autoUpdater.checkForUpdates();
  }, 3600000); // Check every hour
}