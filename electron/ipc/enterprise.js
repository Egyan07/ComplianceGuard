const { ipcMain, dialog } = require('electron');
const log = require('../logger');
const fs = require('fs');
const { z } = require('zod');
const { logAuditEvent } = require('../processing/audit-service');

const _brandingSchema = z.object({
  company_name: z.string().min(1).max(200),
  logo_path: z.string().max(500).nullable().optional(),
  report_footer: z.string().max(500).nullable().optional(),
  system_description: z.string().max(8000).nullable().optional(),
  report_type: z.enum(['type_1', 'type_2']).nullable().optional(),
  period_start: z.string().max(40).nullable().optional(),
  period_end: z.string().max(40).nullable().optional(),
});

const _remediationSchema = z.object({
  framework_id: z.number().int().positive().default(1),
  control_id: z.string().min(1).max(64),
  owner: z.string().max(200).nullable().optional(),
  target_date: z.string().max(40).nullable().optional(),
  notes: z.string().max(2000).nullable().optional(),
});

const _auditQuerySchema = z.object({
  page: z.number().int().min(1).default(1),
  pageSize: z.number().int().min(1).max(200).default(50),
  eventType: z.string().optional(),
});

/**
 * Enterprise-tier IPC handlers: branding config, remediation plan, audit
 * log, and NDJSON data export. All gated behind Enterprise features.
 */
function registerEnterpriseHandlers(ctx) {
  const { database, licenseManager } = ctx;

  // Enterprise: get branding config
  ipcMain.handle('get-enterprise-config', async () => {
    try {
      if (!licenseManager.isFeatureAllowed('enterprise_pdf_branding')) {
        return { error: 'Enterprise license required.' };
      }
      const row = database.db.prepare('SELECT * FROM enterprise_config LIMIT 1').get();
      return row || { company_name: null, logo_path: null, report_footer: null };
    } catch (error) {
      log.error('get-enterprise-config failed:', error);
      return { error: error.message };
    }
  });

  // Enterprise: set branding config
  ipcMain.handle('set-enterprise-config', async (event, payload) => {
    try {
      if (!licenseManager.isFeatureAllowed('enterprise_pdf_branding')) {
        return { error: 'Enterprise license required.' };
      }
      const parsed = _brandingSchema.safeParse(payload);
      if (!parsed.success) {
        return { error: 'Invalid config: ' + parsed.error.message };
      }
      const { company_name, logo_path, report_footer, system_description, report_type, period_start, period_end } = parsed.data;
      const existing = database.db.prepare('SELECT id FROM enterprise_config LIMIT 1').get();
      if (existing) {
        database.db.prepare('UPDATE enterprise_config SET company_name=?, logo_path=?, report_footer=?, system_description=?, report_type=?, period_start=?, period_end=?, updated_at=datetime("now") WHERE id=?')
          .run(company_name, logo_path ?? null, report_footer ?? null, system_description ?? null, report_type ?? null, period_start ?? null, period_end ?? null, existing.id);
      } else {
        database.db.prepare('INSERT INTO enterprise_config (company_name, logo_path, report_footer, system_description, report_type, period_start, period_end) VALUES (?,?,?,?,?,?,?)')
          .run(company_name, logo_path ?? null, report_footer ?? null, system_description ?? null, report_type ?? null, period_start ?? null, period_end ?? null);
      }
      logAuditEvent(database.db, 'enterprise_config_updated', { detail: { company_name } });
      return { success: true };
    } catch (error) {
      log.error('set-enterprise-config failed:', error);
      return { error: error.message };
    }
  });

  // Remediation plan (owner + target date per control) — available where PDF reports are (Pro+)
  ipcMain.handle('get-remediation-plan', async (event, frameworkId = 1) => {
    if (!licenseManager.isFeatureAllowed('pdf_reports')) {
      return { error: 'Remediation planning requires a Pro license.', upgrade_required: true };
    }
    try {
      return { plan: await database.getRemediationPlan(frameworkId) };
    } catch (error) {
      log.error('get-remediation-plan failed:', error);
      return { error: error.message };
    }
  });

  ipcMain.handle('set-remediation', async (event, payload) => {
    if (!licenseManager.isFeatureAllowed('pdf_reports')) {
      return { error: 'Remediation planning requires a Pro license.', upgrade_required: true };
    }
    const parsed = _remediationSchema.safeParse(payload);
    if (!parsed.success) {
      return { error: 'Invalid remediation input: ' + parsed.error.message };
    }
    try {
      const { framework_id, control_id, owner, target_date, notes } = parsed.data;
      await database.setRemediation(framework_id, control_id, { owner: owner ?? null, target_date: target_date ?? null, notes: notes ?? null });
      return { success: true };
    } catch (error) {
      log.error('set-remediation failed:', error);
      return { error: error.message };
    }
  });

  // Enterprise: get audit log (paginated)
  ipcMain.handle('get-audit-log', async (event, params) => {
    try {
      if (!licenseManager.isFeatureAllowed('enterprise_audit_log')) {
        return { error: 'Enterprise license required.' };
      }
      const parsed = _auditQuerySchema.safeParse(params || {});
      if (!parsed.success) {
        return { error: 'Invalid params: ' + parsed.error.message };
      }
      const { page, pageSize, eventType } = parsed.data;
      const offset = (page - 1) * pageSize;
      const rows = eventType
        ? database.db.prepare('SELECT * FROM enterprise_audit_log WHERE event_type = ? ORDER BY id ASC LIMIT ? OFFSET ?').all(eventType, pageSize, offset)
        : database.db.prepare('SELECT * FROM enterprise_audit_log ORDER BY id ASC LIMIT ? OFFSET ?').all(pageSize, offset);
      const total = eventType
        ? database.db.prepare('SELECT COUNT(*) as n FROM enterprise_audit_log WHERE event_type = ?').get(eventType).n
        : database.db.prepare('SELECT COUNT(*) as n FROM enterprise_audit_log').get().n;
      return { total, page, pageSize, entries: rows };
    } catch (error) {
      log.error('get-audit-log failed:', error);
      return { error: error.message };
    }
  });

  // Enterprise: export data as NDJSON to file chosen via system dialog
  ipcMain.handle('export-data', async () => {
    try {
      if (!licenseManager.isFeatureAllowed('enterprise_data_export')) {
        return { error: 'Enterprise license required.' };
      }
      // Path comes from dialog — not from renderer input (prevents path injection)
      const { filePath, canceled } = await dialog.showSaveDialog(ctx.getMainWindow(), {
        title: 'Export Compliance Data',
        defaultPath: `complianceguard-export-${Date.now()}.ndjson`,
        filters: [{ name: 'NDJSON', extensions: ['ndjson'] }],
      });
      if (canceled || !filePath) return { canceled: true };

      const stream = fs.createWriteStream(filePath, { encoding: 'utf8' });
      const write = (obj) => { stream.write(JSON.stringify(obj) + '\n'); };

      write({ type: 'section', name: 'evidence' });
      for (const row of database.db.prepare('SELECT * FROM evidence_items ORDER BY id ASC').all()) {
        write({ type: 'evidence', ...row });
      }
      write({ type: 'section', name: 'evaluations' });
      for (const row of database.db.prepare('SELECT * FROM evaluations ORDER BY id ASC').all()) {
        write({ type: 'evaluation', ...row });
      }
      write({ type: 'section', name: 'enterprise_audit_log' });
      for (const row of database.db.prepare('SELECT * FROM enterprise_audit_log ORDER BY id ASC').all()) {
        write({ type: 'enterprise_audit_log', ...row });
      }

      await new Promise((resolve, reject) => { stream.end(resolve); stream.on('error', reject); });
      logAuditEvent(database.db, 'export_generated', { detail: { file_path: filePath } });
      return { success: true, file_path: filePath };
    } catch (error) {
      log.error('export-data failed:', error);
      return { error: error.message };
    }
  });
}

module.exports = registerEnterpriseHandlers;
