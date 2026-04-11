const { app, BrowserWindow, Tray, Menu, Notification, ipcMain } = require('electron');
const path = require('path');
const url = require('url');

// Keep a global reference of the window object
let mainWindow = null;
let tray = null;

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

// Windows-specific evidence collection
ipcMain.handle('collect-windows-evidence', async () => {
  try {
    const { collectWindowsEvidence } = require('./system/windows');
    return await collectWindowsEvidence();
  } catch (error) {
    console.error('Windows evidence collection failed:', error);
    return { error: error.message };
  }
});

// App event handlers
app.whenReady().then(() => {
  createWindow();
  createTray();

  // Show welcome notification
  setTimeout(() => {
    showNotification(
      'ComplianceGuard Started',
      'SOC 2 automation is now running in the background'
    );
  }, 2000);
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