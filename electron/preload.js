const { contextBridge, ipcRenderer } = require('electron');

// Expose protected methods that allow the renderer process to use
// the ipcRenderer without exposing the entire object
contextBridge.exposeInMainWorld('electronAPI', {
  // App information
  getAppVersion: () => ipcRenderer.invoke('get-app-version'),
  getSystemInfo: () => ipcRenderer.invoke('get-system-info'),

  // Notifications
  showNotification: (title, body) => ipcRenderer.invoke('show-notification', title, body),

  // Evidence collection
  collectWindowsEvidence: () => ipcRenderer.invoke('collect-windows-evidence'),

  // File system operations
  selectFolder: () => ipcRenderer.invoke('select-folder'),
  saveReport: (data, filename) => ipcRenderer.invoke('save-report', data, filename),

  // System monitoring
  startSystemMonitoring: () => ipcRenderer.send('start-system-monitoring'),
  stopSystemMonitoring: () => ipcRenderer.send('stop-system-monitoring'),

  // Event listeners
  onCollectEvidence: (callback) => {
    ipcRenderer.on('collect-evidence', callback);
    return () => {
      ipcRenderer.removeListener('collect-evidence', callback);
    };
  },

  onSystemAlert: (callback) => {
    ipcRenderer.on('system-alert', (event, data) => callback(data));
    return () => {
      ipcRenderer.removeListener('system-alert', callback);
    };
  },

  onComplianceUpdate: (callback) => {
    ipcRenderer.on('compliance-update', (event, data) => callback(data));
    return () => {
      ipcRenderer.removeListener('compliance-update', callback);
    };
  }
});

// Additional Windows-specific APIs
if (process.platform === 'win32') {
  contextBridge.exposeInMainWorld('windowsAPI', {
    // Windows registry access
    readRegistryKey: (keyPath) => ipcRenderer.invoke('read-registry-key', keyPath),

    // Windows event logs
    getEventLogs: (logName, limit = 100) => ipcRenderer.invoke('get-event-logs', logName, limit),

    // Windows services
    getServices: () => ipcRenderer.invoke('get-services'),

    // Windows firewall status
    getFirewallStatus: () => ipcRenderer.invoke('get-firewall-status'),

    // Windows update status
    getUpdateStatus: () => ipcRenderer.invoke('get-update-status')
  });
}

// Error handling
process.on('uncaughtException', (error) => {
  console.error('Uncaught Exception:', error);
  ipcRenderer.send('error', {
    type: 'uncaughtException',
    message: error.message,
    stack: error.stack
  });
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Rejection at:', promise, 'reason:', reason);
  ipcRenderer.send('error', {
    type: 'unhandledRejection',
    reason: reason?.toString()
  });
});

// Performance monitoring
let performanceMetrics = {
  memoryUsage: [],
  cpuUsage: [],
  startTime: Date.now()
};

// Collect performance metrics every 30 seconds
setInterval(() => {
  const memoryUsage = process.memoryUsage();
  performanceMetrics.memoryUsage.push({
    timestamp: Date.now(),
    heapUsed: memoryUsage.heapUsed,
    heapTotal: memoryUsage.heapTotal,
    external: memoryUsage.external
  });

  // Keep only last 100 measurements
  if (performanceMetrics.memoryUsage.length > 100) {
    performanceMetrics.memoryUsage.shift();
  }

  // Send metrics to main process periodically
  if (performanceMetrics.memoryUsage.length % 10 === 0) {
    ipcRenderer.send('performance-metrics', performanceMetrics);
  }
}, 30000);

// Expose performance API
contextBridge.exposeInMainWorld('performanceAPI', {
  getMetrics: () => performanceMetrics,
  getUptime: () => Date.now() - performanceMetrics.startTime
});