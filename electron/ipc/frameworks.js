const { ipcMain } = require('electron');
const log = require('../logger');
const path = require('path');
const fs = require('fs');
const yaml = require('js-yaml');

// ---- Framework Reference Browser ----
// Data source: the CANONICAL shared/frameworks YAMLs (same files the scoring
// engine loads). The legacy duplicate at electron/data/ was removed in Phase 11;
// a parity test (electron/ipc/frameworks.test.js) proves the browser and the
// engine can never drift apart.
const frameworkCache = new Map();
const FRAMEWORK_FILES = {
  1: { name: 'SOC 2', file: 'soc2_controls.yaml' },
  2: { name: 'ISO 27001', file: 'iso27001_controls.yaml' },
  3: { name: 'HIPAA', file: 'hipaa_controls.yaml' },
  4: { name: 'GDPR', file: 'gdpr_controls.yaml' },
};

function sharedDir() {
  // repo layout: <root>/shared/frameworks ; packaged app includes shared/**.
  return path.join(__dirname, '..', '..', 'shared', 'frameworks');
}

/**
 * Framework reference browser IPC handler. Lazy-loads and caches each
 * framework YAML on first request; strips internal scoring fields
 * (`required_evidence`, `evidence_mapping`) at the boundary and defaults
 * `risk_level` to `medium`.
 */
function registerFrameworkHandlers() {
  ipcMain.handle('get-framework-controls', (event, frameworkId) => {
    if (frameworkCache.has(frameworkId)) {
      return frameworkCache.get(frameworkId);
    }
    const meta = FRAMEWORK_FILES[frameworkId];
    if (!meta) {
      return { error: `Unknown framework ID: ${frameworkId}` };
    }
    try {
      const filePath = path.join(sharedDir(), meta.file);
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
        ...(c.chapter !== undefined && { chapter: c.chapter }),
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
}

module.exports = registerFrameworkHandlers;
