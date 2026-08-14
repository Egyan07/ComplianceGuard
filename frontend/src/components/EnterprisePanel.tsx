import React, { useState, useEffect } from 'react';
import {
  Box, Paper, Typography, Button, TextField, Divider, List,
  ListItem, ListItemText, Chip, CircularProgress, Alert, MenuItem,
} from '@mui/material';
import { Security, History, Download, Group } from '@mui/icons-material';
import { useEnterpriseFeature } from '../hooks/useEnterpriseFeature';
import { getElectronAPI, isElectronMode } from '../services/electron';

const isElectron = isElectronMode();

const EnterprisePanel: React.FC = () => {
  const hasEnterprise = useEnterpriseFeature('enterprise_audit_log');

  const [companyName, setCompanyName] = useState('');
  const [reportFooter, setReportFooter] = useState('');
  const [systemDescription, setSystemDescription] = useState('');
  const [reportType, setReportType] = useState('');
  const [periodStart, setPeriodStart] = useState('');
  const [periodEnd, setPeriodEnd] = useState('');
  const [savingBranding, setSavingBranding] = useState(false);
  const [brandingMsg, setBrandingMsg] = useState<string | null>(null);

  // Remediation plan (owner + target date per control)
  const [remRows, setRemRows] = useState<any[]>([]);
  const [remControl, setRemControl] = useState('');
  const [remOwner, setRemOwner] = useState('');
  const [remDate, setRemDate] = useState('');
  const [remNotes, setRemNotes] = useState('');
  const [remSaving, setRemSaving] = useState(false);
  const [remMsg, setRemMsg] = useState<string | null>(null);

  const [auditEntries, setAuditEntries] = useState<any[]>([]);
  const [auditLoading, setAuditLoading] = useState(false);

  const [exporting, setExporting] = useState(false);
  const [exportMsg, setExportMsg] = useState<string | null>(null);

  useEffect(() => {
    if (!hasEnterprise) return;
    if (isElectron) {
      const api = getElectronAPI();
      api.getEnterpriseConfig().then((cfg) => {
        if (cfg && !cfg.error) {
          setCompanyName(cfg.company_name || '');
          setReportFooter(cfg.report_footer || '');
          setSystemDescription(cfg.system_description || '');
          setReportType(cfg.report_type || '');
          setPeriodStart(cfg.period_start || '');
          setPeriodEnd(cfg.period_end || '');
        }
      });
      api.getRemediationPlan(1).then((res) => {
        if (res && res.plan) {
          setRemRows(Object.entries(res.plan).map(([control_id, v]: [string, any]) => ({ control_id, ...v })));
        }
      });
    }
  }, [hasEnterprise]);

  const refreshRemediation = async () => {
    const api = getElectronAPI();
    const res = await api.getRemediationPlan(1);
    if (res && res.plan) {
      setRemRows(Object.entries(res.plan).map(([control_id, v]: [string, any]) => ({ control_id, ...v })));
    }
  };

  const handleSaveRemediation = async () => {
    if (!remControl.trim()) return;
    setRemSaving(true);
    setRemMsg(null);
    try {
      const api = getElectronAPI();
      const result = await api.setRemediation({
        framework_id: 1,
        control_id: remControl.trim(),
        owner: remOwner || null,
        target_date: remDate || null,
        notes: remNotes || null,
      });
      if (result?.error) {
        setRemMsg(`Error: ${result.error}`);
      } else {
        setRemMsg('Remediation saved.');
        setRemControl(''); setRemOwner(''); setRemDate(''); setRemNotes('');
        await refreshRemediation();
      }
    } catch {
      setRemMsg('Failed to save remediation.');
    } finally {
      setRemSaving(false);
    }
  };

  if (!hasEnterprise) return null;

  const handleSaveBranding = async () => {
    setSavingBranding(true);
    setBrandingMsg(null);
    try {
      if (isElectron) {
        const api = getElectronAPI();
        const result = await api.setEnterpriseConfig({
          company_name: companyName,
          report_footer: reportFooter,
          system_description: systemDescription,
          report_type: reportType || null,
          period_start: periodStart || null,
          period_end: periodEnd || null,
        });
        setBrandingMsg(result?.error ? `Error: ${result.error}` : 'Branding saved.');
      }
    } catch {
      setBrandingMsg('Failed to save branding.');
    } finally {
      setSavingBranding(false);
    }
  };

  const handleLoadAuditLog = async () => {
    setAuditLoading(true);
    try {
      if (isElectron) {
        const api = getElectronAPI();
        const result = await api.getAuditLog({ page: 1, pageSize: 50 });
        setAuditEntries(result?.entries || []);
      }
    } finally {
      setAuditLoading(false);
    }
  };

  const handleExport = async () => {
    setExporting(true);
    setExportMsg(null);
    try {
      if (isElectron) {
        const api = getElectronAPI();
        const result = await api.exportData();
        if (result?.canceled) { setExportMsg(null); return; }
        setExportMsg(result?.error ? `Export failed: ${result.error}` : `Exported to: ${result.file_path}`);
      }
    } finally {
      setExporting(false);
    }
  };

  return (
    <Box>
      {/* Branding */}
      <Paper sx={{ mb: 3 }}>
        <Box sx={{ p: 3 }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 2 }}>
            <Security color="primary" />
            <Typography sx={{ fontSize: '0.6rem', fontWeight: 700, letterSpacing: '1.6px', textTransform: 'uppercase', color: 'text.disabled' }}>Branding</Typography>
            <Chip label="ENTERPRISE" size="small" color="primary" />
          </Box>
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
            <TextField size="small" label="Company Name" value={companyName} onChange={e => setCompanyName(e.target.value)} />
            <TextField size="small" label="Report Footer (optional)" value={reportFooter} onChange={e => setReportFooter(e.target.value)} />
            <TextField size="small" label="System Description (for SOC 2 report — infrastructure, software, people, data, subservice orgs)" value={systemDescription} onChange={e => setSystemDescription(e.target.value)} multiline minRows={4} />
            <TextField size="small" select label="Engagement type" value={reportType} onChange={e => setReportType(e.target.value)}>
              <MenuItem value="">Point-in-time (default)</MenuItem>
              <MenuItem value="type_1">SOC 2 Type I (design)</MenuItem>
              <MenuItem value="type_2">SOC 2 Type II (design & operating effectiveness)</MenuItem>
            </TextField>
            {reportType === 'type_2' && (
              <Box sx={{ display: 'flex', gap: 1.5 }}>
                <TextField size="small" label="Period start (e.g. 2026-01-01)" value={periodStart} onChange={e => setPeriodStart(e.target.value)} fullWidth />
                <TextField size="small" label="Period end (e.g. 2026-06-30)" value={periodEnd} onChange={e => setPeriodEnd(e.target.value)} fullWidth />
              </Box>
            )}
            <Button variant="contained" size="small" disabled={savingBranding || !companyName} onClick={handleSaveBranding}>
              {savingBranding ? 'Saving…' : 'Save Branding'}
            </Button>
            {brandingMsg && <Alert severity={brandingMsg.startsWith('Error') ? 'error' : 'success'} sx={{ py: 0 }}>{brandingMsg}</Alert>}
          </Box>
        </Box>
      </Paper>

      {/* Remediation Plan */}
      <Paper sx={{ mb: 3 }}>
        <Box sx={{ p: 3 }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 2 }}>
            <Security color="primary" />
            <Typography sx={{ fontSize: '0.6rem', fontWeight: 700, letterSpacing: '1.6px', textTransform: 'uppercase', color: 'text.disabled' }}>Remediation Plan</Typography>
          </Box>
          <Typography sx={{ fontSize: '0.75rem', color: 'text.secondary', mb: 1.5 }}>
            Assign an owner and target date to a control. These appear in the report's Remediation Roadmap and per-control detail.
          </Typography>
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
            <TextField size="small" label="Control ID (e.g. CC6.1)" value={remControl} onChange={e => setRemControl(e.target.value)} />
            <TextField size="small" label="Owner" value={remOwner} onChange={e => setRemOwner(e.target.value)} />
            <TextField size="small" label="Target date (e.g. 2026-09-30)" value={remDate} onChange={e => setRemDate(e.target.value)} />
            <TextField size="small" label="Notes (optional)" value={remNotes} onChange={e => setRemNotes(e.target.value)} multiline minRows={2} />
            <Button variant="contained" size="small" disabled={remSaving || !remControl.trim()} onClick={handleSaveRemediation}>
              {remSaving ? 'Saving…' : 'Save Remediation'}
            </Button>
            {remMsg && <Alert severity={remMsg.startsWith('Error') ? 'error' : 'success'} sx={{ py: 0 }}>{remMsg}</Alert>}
          </Box>
          {remRows.length > 0 && (
            <List disablePadding dense sx={{ mt: 2 }}>
              {remRows.map((r, i) => (
                <React.Fragment key={r.control_id ?? i}>
                  <ListItem sx={{ py: 0.5 }}>
                    <ListItemText
                      primary={`${r.control_id} — ${r.owner || 'unassigned'}`}
                      secondary={`Target: ${r.target_date || '—'}${r.notes ? ` · ${r.notes}` : ''}`}
                      slotProps={{ primary: { sx: { fontSize: '0.8rem' } }, secondary: { sx: { fontSize: '0.7rem' } } }}
                    />
                  </ListItem>
                  {i < remRows.length - 1 && <Divider component="li" />}
                </React.Fragment>
              ))}
            </List>
          )}
        </Box>
      </Paper>

      {/* Audit Log */}
      <Paper sx={{ mb: 3 }}>
        <Box sx={{ p: 3 }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 2 }}>
            <History color="primary" />
            <Typography sx={{ fontSize: '0.6rem', fontWeight: 700, letterSpacing: '1.6px', textTransform: 'uppercase', color: 'text.disabled' }}>Audit Log</Typography>
          </Box>
          <Button variant="outlined" size="small" onClick={handleLoadAuditLog} disabled={auditLoading} sx={{ mb: 1 }}>
            {auditLoading ? <CircularProgress size={14} /> : 'Load Audit Log'}
          </Button>
          {auditEntries.length > 0 && (
            <List disablePadding dense>
              {auditEntries.map((e, i) => (
                <React.Fragment key={e.id ?? i}>
                  <ListItem sx={{ py: 0.5 }}>
                    <ListItemText
                      primary={e.event_type}
                      secondary={`${e.framework ?? '—'} · Score: ${e.score ?? '—'} · ${e.created_at}`}
                      slotProps={{ primary: { sx: { fontSize: '0.8rem' } }, secondary: { sx: { fontSize: '0.7rem' } } }}
                    />
                  </ListItem>
                  {i < auditEntries.length - 1 && <Divider component="li" />}
                </React.Fragment>
              ))}
            </List>
          )}
        </Box>
      </Paper>

      {/* Users & Roles — web only */}
      {!isElectron && (
        <Paper sx={{ mb: 3 }}>
          <Box sx={{ p: 3 }}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 2 }}>
              <Group color="primary" />
              <Typography sx={{ fontSize: '0.6rem', fontWeight: 700, letterSpacing: '1.6px', textTransform: 'uppercase', color: 'text.disabled' }}>Users &amp; Roles</Typography>
            </Box>
            <Typography variant="body2" color="text.secondary">
              RBAC user management is available via the web API endpoints for Enterprise deployments.
            </Typography>
          </Box>
        </Paper>
      )}

      {/* Data Export */}
      <Paper sx={{ mb: 3 }}>
        <Box sx={{ p: 3 }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 2 }}>
            <Download color="primary" />
            <Typography sx={{ fontSize: '0.6rem', fontWeight: 700, letterSpacing: '1.6px', textTransform: 'uppercase', color: 'text.disabled' }}>Data Export</Typography>
          </Box>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
            Export all compliance data — evidence, evaluations, and audit log — as a NDJSON file.
          </Typography>
          <Button variant="outlined" size="small" disabled={exporting} onClick={handleExport} startIcon={exporting ? <CircularProgress size={14} /> : <Download />}>
            {exporting ? 'Exporting…' : 'Export Data'}
          </Button>
          {exportMsg && <Alert severity={exportMsg.startsWith('Export failed') ? 'error' : 'success'} sx={{ mt: 1, py: 0 }}>{exportMsg}</Alert>}
        </Box>
      </Paper>
    </Box>
  );
};

export default EnterprisePanel;
