/**
 * Application logger for ComplianceGuard.
 *
 * Wraps electron-log so that:
 *  - In production builds, only warn/error reach the log file and console.
 *  - In development (NODE_ENV=development), info/debug are also emitted.
 *
 * Usage:
 *   const log = require('./logger');
 *   log.info('Starting…');
 *   log.warn('Something odd');
 *   log.error('Fatal', error);
 */

const electronLog = require('electron-log');

const isDev = process.env.NODE_ENV === 'development';

// electron-log level order (lowest → highest):
//   silly | debug | verbose | info | warn | error
electronLog.transports.console.level = isDev ? 'info' : 'warn';
electronLog.transports.file.level = isDev ? 'info' : 'warn';

// Tighten the file log format for readability
electronLog.transports.file.format = '[{y}-{m}-{d} {h}:{i}:{s}.{ms}] [{level}] {text}';

const log = {
  debug: (...args) => electronLog.debug(...args),
  info:  (...args) => electronLog.info(...args),
  warn:  (...args) => electronLog.warn(...args),
  error: (...args) => electronLog.error(...args),
};

module.exports = log;
