const crypto = require('crypto');

function canonicalJson(obj) {
  if (obj === null || obj === undefined) return 'null';
  if (typeof obj !== 'object' || Array.isArray(obj)) {
    return JSON.stringify(obj);
  }
  const sorted = {};
  Object.keys(obj).sort().forEach(k => {
    sorted[k] = obj[k];
  });
  return JSON.stringify(sorted);
}

function computeEntryHash(prevHash, eventType, userId, framework, score, detail, createdAt) {
  const payload = canonicalJson({
    prev_hash: prevHash !== undefined ? prevHash : null,
    event_type: eventType || '',
    user_id: userId !== undefined ? userId : null,
    framework: framework !== undefined ? framework : null,
    score: score !== undefined ? score : null,
    detail: (detail && typeof detail === 'object') ? detail : {},
    created_at: createdAt || '',
  });
  return crypto.createHash('sha256').update(payload, 'utf8').digest('hex');
}

function logAuditEvent(db, eventType, { userId = null, framework = null, score = null, detail = {} } = {}) {
  // Accept either a raw better-sqlite3 handle or the ComplianceGuardDatabase
  // wrapper (which exposes the raw connection as .db) so callers can pass
  // whichever they hold. The evidence processor passes the wrapper.
  const handle = (db && db.db) || db;
  const last = handle.prepare('SELECT entry_hash FROM enterprise_audit_log ORDER BY id DESC LIMIT 1').get();
  const prevHash = last ? last.entry_hash : null;
  const createdAt = new Date().toISOString();
  const entryHash = computeEntryHash(prevHash, eventType, userId, framework, score, detail, createdAt);
  handle.prepare(`
    INSERT INTO enterprise_audit_log (event_type, user_id, framework, score, detail_json, prev_hash, entry_hash, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(eventType, userId, framework, score, JSON.stringify(detail), prevHash, entryHash, createdAt);
}

module.exports = { canonicalJson, computeEntryHash, logAuditEvent };
