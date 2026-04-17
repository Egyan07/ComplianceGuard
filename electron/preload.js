const { contextBridge, ipcRenderer } = require('electron');

// Expose protected methods to the renderer process
contextBridge.exposeInMainWorld('electronAPI', {
  // App information
  getAppVersion: () => ipcRenderer.invoke('get-app-version'),
  getSystemInfo: () => ipcRenderer.invoke('get-system-info'),

  // Notifications
  showNotification: (title, body) => {
    if (typeof title !== 'string' || typeof body !== 'string') return;
    ipcRenderer.invoke('show-notification', title, body);
  },

  // Evidence collection
  collectWindowsEvidence: (frameworkId = 1) => {
    if (typeof frameworkId !== 'number' || frameworkId < 1) frameworkId = 1;
    return ipcRenderer.invoke('collect-windows-evidence', frameworkId);
  },

  processManualEvidence: (evidenceData, frameworkId = 1) => {
    if (!evidenceData || typeof evidenceData !== 'object') {
      return Promise.reject(new Error('Invalid evidence data'));
    }
    return ipcRenderer.invoke('process-manual-evidence', evidenceData, frameworkId);
  },

  // Evidence queries
  getEvidenceSummary: (frameworkId = 1) => {
    return ipcRenderer.invoke('get-evidence-summary', frameworkId);
  },

  getEvidenceList: (frameworkId = 1) => {
    return ipcRenderer.invoke('get-evidence-list', frameworkId);
  },

  searchEvidence: (frameworkId, searchTerm, filters = {}) => {
    if (typeof searchTerm !== 'string') searchTerm = '';
    return ipcRenderer.invoke('search-evidence', frameworkId, searchTerm, filters);
  },

  // Compliance evaluation
  evaluateCompliance: (frameworkId = 1) => {
    return ipcRenderer.invoke('evaluate-compliance', frameworkId);
  },

  getEvaluationHistory: (frameworkId = 1) => {
    return ipcRenderer.invoke('get-evaluation-history', frameworkId);
  },

  generateComplianceReport: (frameworkId = 1, format = 'detailed') => {
    const allowedFormats = ['detailed', 'summary'];
    if (!allowedFormats.includes(format)) format = 'detailed';
    return ipcRenderer.invoke('generate-compliance-report', frameworkId, format);
  },

  exportPDFReport: (frameworkId = 1) => {
    return ipcRenderer.invoke('export-pdf-report', frameworkId);
  },

  // File system operations
  selectFolder: () => ipcRenderer.invoke('select-folder'),
  selectEvidenceFile: () => ipcRenderer.invoke('select-evidence-file'),
  saveReport: (data, filename) => ipcRenderer.invoke('save-report', data, filename),

  // User settings
  getUserSetting: (key, defaultValue = null) => {
    if (typeof key !== 'string') return Promise.resolve(defaultValue);
    return ipcRenderer.invoke('get-user-setting', key, defaultValue);
  },
  setUserSetting: (key, value, type = 'string') => {
    if (typeof key !== 'string') return Promise.reject(new Error('Invalid key'));
    return ipcRenderer.invoke('set-user-setting', key, value, type);
  },

  // License management
  getLicenseInfo: () => ipcRenderer.invoke('get-license-info'),
  activateLicense: (keyString) => {
    if (typeof keyString !== 'string' || keyString.length < 10) {
      return Promise.reject(new Error('Invalid license key'));
    }
    return ipcRenderer.invoke('activate-license', keyString);
  },
  deactivateLicense: () => ipcRenderer.invoke('deactivate-license'),
  checkFeature: (featureName) => {
    if (typeof featureName !== 'string') return Promise.resolve(false);
    return ipcRenderer.invoke('check-feature', featureName);
  },
  onLicenseChanged: (callback) => {
    const handler = (event, data) => callback(data);
    ipcRenderer.on('license-changed', handler);
    return () => ipcRenderer.removeListener('license-changed', handler);
  },

  // Database maintenance
  createBackup: () => ipcRenderer.invoke('create-database-backup'),

  // Event listeners (from main process)
  onCollectEvidence: (callback) => {
    const handler = (event, ...args) => callback(...args);
    ipcRenderer.on('collect-evidence', handler);
    return () => ipcRenderer.removeListener('collect-evidence', handler);
  },

  onSystemAlert: (callback) => {
    const handler = (event, data) => callback(data);
    ipcRenderer.on('system-alert', handler);
    return () => ipcRenderer.removeListener('system-alert', handler);
  },

  onComplianceUpdate: (callback) => {
    const handler = (event, data) => callback(data);
    ipcRenderer.on('compliance-update', handler);
    return () => ipcRenderer.removeListener('compliance-update', handler);
  },

  cloudConnect: (serverUrl, email, password) => {
    if (typeof serverUrl !== 'string' || typeof email !== 'string' || typeof password !== 'string') {
      return Promise.reject(new Error('Invalid cloud connect params'));
    }
    return ipcRenderer.invoke('cloud-connect', serverUrl, email, password);
  },
  cloudSync: (syncData) => {
    if (!syncData || typeof syncData !== 'object') {
      return Promise.reject(new Error('Invalid sync data'));
    }
    return ipcRenderer.invoke('cloud-sync', syncData);
  },
  cloudGetConfig: () => ipcRenderer.invoke('cloud-get-config'),
  cloudDisconnect: () => ipcRenderer.invoke('cloud-disconnect'),
});

// Windows-specific APIs (only exposed on Windows)
if (process.platform === 'win32') {
  contextBridge.exposeInMainWorld('windowsAPI', {
    getEventLogs: (logName, limit = 100) => {
      const allowedLogs = ['Security', 'System', 'Application'];
      if (!allowedLogs.includes(logName)) {
        return Promise.reject(new Error(`Invalid log name. Allowed: ${allowedLogs.join(', ')}`));
      }
      if (typeof limit !== 'number' || limit < 1 || limit > 1000) limit = 100;
      return ipcRenderer.invoke('get-event-logs', logName, limit);
    },

    getServices: () => ipcRenderer.invoke('get-services'),
    getFirewallStatus: () => ipcRenderer.invoke('get-firewall-status')
  });
}
