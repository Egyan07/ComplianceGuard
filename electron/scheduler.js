const { powerMonitor, Notification } = require('electron');
const log = require('./logger');
// Platform-aware collector (Windows or macOS) — mirrors main.js. Using the
// Windows collector directly produced hollow/empty evidence on scheduled macOS runs.
const { collectEvidence } = require('./system/collector');

const FRAMEWORKS = [1, 2, 3];
const CHECK_INTERVAL_MS = 60_000;

let _db = null;
let _processor = null;
let _isRunning = false;
let _intervalId = null;

function calcNextRunAt(config) {
  const [hours, minutes] = config.time.split(':').map(Number);
  const next = new Date();
  next.setHours(hours, minutes, 0, 0);

  if (config.frequency === 'weekly') {
    let daysUntilMonday = (8 - next.getDay()) % 7;
    if (daysUntilMonday === 0 && next <= new Date()) {
      daysUntilMonday = 7;
    }
    next.setDate(next.getDate() + daysUntilMonday);
    return next.toISOString();
  }

  // Daily: if today's time has already passed, schedule for tomorrow
  if (next <= new Date()) {
    next.setDate(next.getDate() + 1);
  }

  return next.toISOString();
}

async function persistResult(ranAt, result) {
  try {
    const task = await _db.getScheduleTask();
    if (!task) return;
    const config = JSON.parse(task.schedule_config_json);
    const nextRunAt = calcNextRunAt(config);
    await _db.updateScheduleResult(ranAt, nextRunAt, result);
  } catch (err) {
    log.error('Failed to persist schedule result:', err);
  }
}

async function runCollection() {
  if (_isRunning) return { error: 'Collection already in progress' };
  _isRunning = true;
  const ranAt = new Date().toISOString();

  try {
    log.info('Scheduled evidence collection starting...');
    const evidence = await collectEvidence();
    let evidenceCount = 0;

    for (const frameworkId of FRAMEWORKS) {
      const items = await _processor.processWindowsEvidence(evidence, frameworkId);
      if (frameworkId === 1) evidenceCount = items.length;
    }

    const result = { success: true, evidence_count: evidenceCount, ran_at: ranAt };
    await persistResult(ranAt, result);
    log.info(`Scheduled collection complete: ${evidenceCount} items`);

    if (Notification.isSupported()) {
      new Notification({
        title: 'Evidence Collection Complete',
        body: `${evidenceCount} items collected across 3 frameworks`,
      }).show();
    }

    return result;
  } catch (err) {
    log.error('Scheduled collection failed:', err);
    const result = { success: false, evidence_count: 0, ran_at: ranAt, error: err.message };
    await persistResult(ranAt, result);

    if (Notification.isSupported()) {
      new Notification({
        title: 'Evidence Collection Failed',
        body: err.message,
      }).show();
    }

    return result;
  } finally {
    _isRunning = false;
  }
}

async function checkAndRun() {
  try {
    const task = await _db.getScheduleTask();
    if (!task) return;
    const config = JSON.parse(task.schedule_config_json);
    if (!config.enabled) return;
    if (!task.next_run_at) return;
    if (new Date() < new Date(task.next_run_at)) return;
    await runCollection();
  } catch (err) {
    log.error('Schedule check failed:', err);
  }
}

async function start(database, evidenceProcessor) {
  _db = database;
  _processor = evidenceProcessor;
  try {
    await _db.ensureScheduleTask();
    _intervalId = setInterval(checkAndRun, CHECK_INTERVAL_MS);
    powerMonitor.on('resume', checkAndRun);
    log.info('Scheduler started');
  } catch (err) {
    log.error('Scheduler failed to start:', err);
  }
}

function stop() {
  if (_intervalId) clearInterval(_intervalId);
  _intervalId = null;
  powerMonitor.removeListener('resume', checkAndRun);
}

module.exports = { start, stop, checkAndRun, runCollection, calcNextRunAt };
