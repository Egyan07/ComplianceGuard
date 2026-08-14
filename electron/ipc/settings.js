const { ipcMain } = require('electron');
const log = require('../logger');
const scheduler = require('../scheduler');

/**
 * User settings + automatic collection scheduling IPC handlers.
 */
function registerSettingsHandlers(ctx) {
  const { database } = ctx;

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

  // Database backup
  ipcMain.handle('create-database-backup', async () => {
    try {
      const backupPath = await database.backup();
      ctx.showNotification('Database Backup Created', `Backup saved to: ${backupPath}`);
      return { success: true, backup_path: backupPath };
    } catch (error) {
      log.error('Database backup failed:', error);
      return { error: error.message };
    }
  });
}

module.exports = registerSettingsHandlers;
