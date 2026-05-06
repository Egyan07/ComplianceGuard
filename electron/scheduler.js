import { powerMonitor, Notification } from 'electron';
import * as log from './logger.js';
import { collectWindowsEvidence } from './system/windows.js';

const FRAMEWORKS = [1, 2, 3];
const CHECK_INTERVAL_MS = 60_000;

let _db = null;
let _processor = null;
let _isRunning = false;
let _intervalId = null;

export function calcNextRunAt(config) {
  const [hours, minutes] = config.time.split(':').map(Number);
  const next = new Date();
  next.setSeconds(0, 0);
  next.setHours(hours, minutes);

  if (config.frequency === 'weekly') {
    // Advance to next Monday
    const daysUntilMonday = (8 - next.getDay()) % 7 || 7;
    next.setDate(next.getDate() + daysUntilMonday);
    return next.toISOString();
  }

  // Daily: if today's time has already passed, schedule for tomorrow
  if (next <= new Date()) {
    next.setDate(next.getDate() + 1);
  }

  return next.toISOString();
}

export async function runCollection() {
  if (_isRunning) return { error: 'Collection already in progress' };
  _isRunning = true;
  const ranAt = new Date().toISOString();

  try {
    log.info('Scheduled evidence collection starting...');
    const windowsEvidence = await collectWindowsEvidence();
    let evidenceCount = 0;

    for (const frameworkId of FRAMEWORKS) {
      const items = await _processor.processWindowsEvidence(windowsEvidence, frameworkId);
      if (frameworkId === 1) evidenceCount = items.length;
    }

    const task = await _db.getScheduleTask();
    const config = JSON.parse(task.schedule_config_json);
    const nextRunAt = calcNextRunAt(config);
    const result = { success: true, evidence_count: evidenceCount, ran_at: ranAt };

    await _db.updateScheduleResult(ranAt, nextRunAt, result);
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
    const task = await _db.getScheduleTask();
    const config = JSON.parse(task.schedule_config_json);
    const nextRunAt = calcNextRunAt(config);
    const result = { success: false, evidence_count: 0, ran_at: ranAt, error: err.message };
    await _db.updateScheduleResult(ranAt, nextRunAt, result);

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

export async function checkAndRun() {
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

export async function start(database, evidenceProcessor) {
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

export function stop() {
  if (_intervalId) clearInterval(_intervalId);
  _intervalId = null;
}
