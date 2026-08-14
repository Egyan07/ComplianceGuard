const { app, BrowserWindow, Tray, Menu, Notification } = require('electron');
const log = require('./logger');
const path = require('path');
const fs = require('fs');

// Local processing modules
const ComplianceGuardDatabase = require('./database/sqlite');
const LocalEvidenceProcessor = require('./processing/evidence-processor');
const LocalComplianceEngine = require('./processing/compliance-engine');
const ReportGenerator = require('./processing/report-generator');
const LicenseManager = require('./licensing/license-manager');
const scheduler = require('./scheduler');
const registerIpcHandlers = require('./ipc');

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

function showNotification(title, body) {
  if (!Notification.isSupported()) return;

  const notification = new Notification({
    title: title,
    body: body
  });
  notification.show();
}

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

    // Register all IPC handlers (see electron/ipc/). Handlers resolve the
    // main window lazily via getMainWindow(), so this can run before
    // createWindow().
    registerIpcHandlers({
      database,
      evidenceProcessor,
      complianceEngine,
      reportGenerator,
      licenseManager,
      showNotification,
      getMainWindow: () => mainWindow,
    });

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
