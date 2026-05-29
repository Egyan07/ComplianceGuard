import React, { useState } from 'react';
import { Box, Paper, Typography, LinearProgress, Chip, Button } from '@mui/material';
import type { ControlResult } from '../services/api';

const CONTROL_NAMES: Record<string, string> = {
  'CC1.1':'Control Environment','CC1.2':'Board Independence','CC2.1':'Communication & Information',
  'CC3.1':'Risk Assessment','CC4.1':'Monitoring','CC5.1':'Control Activities',
  'CC6.1':'Logical Access Controls','CC6.2':'Authentication','CC6.3':'Authorization Controls',
  'CC6.4':'Segregation of Duties','CC6.5':'Network Security','CC6.6':'Physical Access',
  'CC6.7':'Data Transmission','CC7.1':'Event Logging','CC7.2':'Vulnerability Management',
  'CC8.1':'Change Management','CC9.1':'Risk Mitigation',
  'A1.1':'System Availability','A1.2':'Environmental Protection','A1.3':'Capacity Management','A1.4':'Backup & Recovery',
  'C1.1':'Data Classification','C1.2':'Data Protection','C1.3':'Data Disposal','C1.4':'Disclosure Controls',
  'PI1.1':'Processing Accuracy','PI1.2':'Input Controls','PI1.3':'Error Detection','PI1.4':'Output Review',
};

const CATEGORIES: { label: string; ids: string[] }[] = [
  { label: 'Common Criteria (CC)', ids: ['CC1.1','CC1.2','CC2.1','CC3.1','CC4.1','CC5.1','CC6.1','CC6.2','CC6.3','CC6.4','CC6.5','CC6.6','CC6.7','CC7.1','CC7.2','CC8.1','CC9.1'] },
  { label: 'Availability (A)',     ids: ['A1.1','A1.2','A1.3','A1.4'] },
  { label: 'Confidentiality (C)', ids: ['C1.1','C1.2','C1.3','C1.4'] },
  { label: 'Processing Integrity (PI)', ids: ['PI1.1','PI1.2','PI1.3','PI1.4'] },
];

type Filter = 'all' | 'failing' | 'partial';
type StatusKey = 'compliant' | 'non_compliant' | 'partial' | 'not_assessed';

const STATUS_CONFIG: Record<StatusKey, { label: string; color: string; bg: string; border: string; barColor: string }> = {
  compliant:     { label: 'Pass',    color: '#16A34A', bg: '#F0FDF4', border: '#BBF7D0', barColor: '#10B981' },
  non_compliant: { label: 'Fail',    color: '#DC2626', bg: '#FEF2F2', border: '#FECACA', barColor: '#EF4444' },
  partial:       { label: 'Partial', color: '#D97706', bg: '#FFFBEB', border: '#FDE68A', barColor: '#F59E0B' },
  not_assessed:  { label: 'N/A',     color: '#94A3B8', bg: '#F8FAFC', border: '#E2E8F0', barColor: '#CBD5E1' },
};

const AUTOMATABLE_CONTROLS = new Set(['CC6.1','CC6.2','CC6.3','CC6.5','CC7.1','CC7.2']);

const SCRIPT_ACTIONS: Record<string, string> = {
  'CC6.1': 'netsh advfirewall set allprofiles state on',
  'CC6.2': 'secedit /configure — sets password policy (min 12 chars, 90-day expiry)',
  'CC6.3': 'auditpol /set — enables logon + account management audit events',
  'CC6.5': 'netsh advfirewall firewall add rule — blocks Telnet/FTP/RDP-public',
  'CC7.1': 'wevtutil sl Security — sets 100MB log, enables process audit',
  'CC7.2': 'Set-MpPreference — enables Defender RTP + Windows Update service',
};

export interface ControlHeatmapProps {
  controlResults: Record<string, ControlResult> | null;
  isElectron: boolean;
  isProTier: boolean;
  onDownloadScript?: (controlId: string) => Promise<{ success: boolean; file_name?: string }>;
  onRescan?: () => Promise<void>;
}

export type RemediationState = 'idle' | 'downloaded' | 'rescanning' | 'verified' | 'verification_failed';

const ControlHeatmap: React.FC<ControlHeatmapProps> = ({
  controlResults,
  isElectron,
  isProTier,
  onDownloadScript,
  onRescan,
}) => {
  const [filter, setFilter] = useState<Filter>('all');
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [remediationStates, setRemediationStates] = useState<Record<string, RemediationState>>({});

  const filterRow = (status: StatusKey): boolean => {
    if (filter === 'failing') return status === 'non_compliant';
    if (filter === 'partial') return status === 'partial';
    return true;
  };

  return (
    <Paper sx={{ borderRadius: 3.5, overflow: 'hidden', border: '1px solid', borderColor: 'divider' }}>
      {/* Header */}
      <Box sx={{ px: 2.5, py: 1.75, borderBottom: '1px solid', borderColor: 'divider', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <Typography sx={{ fontSize: '0.7rem', fontWeight: 700, color: 'text.primary', display: 'flex', alignItems: 'center', gap: 1 }}>
          Controls
          <Box component="span" sx={{ fontSize: '0.6rem', color: 'text.disabled', fontWeight: 400 }}>
            SOC 2 Type II · 29 controls
          </Box>
        </Typography>
        <Box sx={{ display: 'flex', gap: 0.75 }}>
          {([['all', 'All'], ['failing', 'Failing'], ['partial', 'Partial']] as [Filter, string][]).map(([f, label]) => (
            <Chip
              key={f}
              label={label}
              size="small"
              onClick={() => { setFilter(f); setExpandedId(null); }}
              sx={{
                fontSize: '0.6rem', fontWeight: 600, height: 24, cursor: 'pointer',
                bgcolor: filter === f ? '#EFF6FF' : 'transparent',
                color: filter === f ? '#1D4ED8' : 'text.secondary',
                border: '1px solid', borderColor: filter === f ? '#BFDBFE' : 'divider',
              }}
            />
          ))}
        </Box>
      </Box>

      {/* Body */}
      <Box sx={{ px: 1.25, py: 0.75 }}>
        {!controlResults ? (
          <Box sx={{ py: 6, textAlign: 'center', border: '1.5px dashed', borderColor: 'divider', borderRadius: 2, mx: 1, my: 1 }}>
            <Typography sx={{ fontSize: '0.75rem', color: 'text.disabled' }}>
              Run an evaluation to see control status
            </Typography>
          </Box>
        ) : !isProTier ? (
          <Box sx={{ py: 5, textAlign: 'center' }}>
            <Typography sx={{ fontSize: '0.75rem', color: 'text.secondary', mb: 1 }}>
              Per-control breakdown requires Pro
            </Typography>
            <Chip label="Upgrade to Pro" size="small" color="primary" variant="outlined" />
          </Box>
        ) : (
          CATEGORIES.map(cat => {
            const visibleIds = cat.ids.filter(id => {
              const status: StatusKey = controlResults[id]?.status ?? 'not_assessed';
              return filterRow(status);
            });
            if (visibleIds.length === 0) return null;
            return (
              <Box key={cat.label}>
                <Typography sx={{ fontSize: '0.55rem', fontWeight: 700, letterSpacing: '1.5px', textTransform: 'uppercase', color: 'text.disabled', px: 1, pt: 1, pb: 0.5 }}>
                  {cat.label}
                </Typography>
                {visibleIds.map(id => {
                  const r = controlResults[id];
                  const status: StatusKey = r?.status ?? 'not_assessed';
                  const cfg = STATUS_CONFIG[status];
                  const score = Math.max(0, Math.min(100, r?.score ?? 0));
                  const isFail = status === 'non_compliant';
                  const isAutomatable = AUTOMATABLE_CONTROLS.has(id);

                  return (
                    <React.Fragment key={id}>
                      <Box
                        sx={{
                          display: 'flex', alignItems: 'center', gap: 1.25,
                          px: 1, py: 0.875, borderRadius: 1.5, mb: 0.25,
                          bgcolor: isFail ? '#FFF8F8' : 'transparent',
                          '&:hover': { bgcolor: isFail ? '#FFF3F3' : 'action.hover' },
                        }}
                      >
                        <Typography sx={{ fontSize: '0.58rem', fontWeight: 700, color: isFail ? '#DC2626' : 'text.disabled', width: 42, flexShrink: 0 }}>
                          {id}
                        </Typography>
                        <Typography sx={{ fontSize: '0.65rem', fontWeight: isFail ? 600 : 500, color: isFail ? 'text.primary' : 'text.secondary', flex: 1 }}>
                          {CONTROL_NAMES[id] ?? id}
                        </Typography>
                        <Box sx={{ width: 80, flexShrink: 0 }}>
                          <LinearProgress
                            variant="determinate"
                            value={score}
                            aria-label={`${id} compliance score: ${Math.round(score)} percent`}
                            sx={{ height: 5, borderRadius: 2, bgcolor: '#F1F5F9', '& .MuiLinearProgress-bar': { bgcolor: cfg.barColor, borderRadius: 2 } }}
                          />
                        </Box>
                        <Typography sx={{ fontSize: '0.58rem', color: isFail ? '#FCA5A5' : 'text.disabled', width: 30, textAlign: 'right', flexShrink: 0 }}>
                          {Math.round(score)}%
                        </Typography>
                        <Chip
                          label={cfg.label}
                          size="small"
                          sx={{ fontSize: '0.55rem', fontWeight: 600, height: 20, bgcolor: cfg.bg, color: cfg.color, border: '1px solid', borderColor: cfg.border, flexShrink: 0 }}
                        />
                        {(status === 'non_compliant' || status === 'partial') && (
                          isElectron && isAutomatable
                            ? (
                              <Button
                                size="small"
                                aria-expanded={expandedId === id}
                                aria-controls={`accordion-${id}`}
                                onClick={() => setExpandedId(prev => prev === id ? null : id)}
                                sx={{
                                  fontSize: '0.58rem', fontWeight: 600, px: 1.25, py: 0.5, minWidth: 0,
                                  bgcolor: '#EFF6FF', color: '#1D4ED8', border: '1px solid #BFDBFE',
                                  borderRadius: 1.5, flexShrink: 0, textTransform: 'none',
                                  '&:hover': { bgcolor: '#DBEAFE' },
                                }}
                              >
                                Fix script
                              </Button>
                            ) : (
                              <Button
                                size="small"
                                aria-expanded={expandedId === id}
                                aria-controls={`accordion-${id}`}
                                onClick={() => setExpandedId(prev => prev === id ? null : id)}
                                sx={{
                                  fontSize: '0.58rem', fontWeight: 600, px: 1.25, py: 0.5, minWidth: 0,
                                  bgcolor: '#FFFBEB', color: '#B45309', border: '1px solid #FDE68A',
                                  borderRadius: 1.5, flexShrink: 0, textTransform: 'none',
                                  '&:hover': { bgcolor: '#FEF3C7' },
                                }}
                              >
                                How to fix
                              </Button>
                            )
                        )}
                      </Box>
                      {expandedId === id && (status === 'non_compliant' || status === 'partial') && (
                        <Box id={`accordion-${id}`} role="region" aria-label={`${id} remediation details`} sx={{ mx: 0.5, mb: 0.75, border: '1px solid #E2E8F0', borderRadius: 2, overflow: 'hidden' }}>
                          {/* Accordion header */}
                          <Box sx={{ px: 2, py: 1.25, borderBottom: '1px solid', borderColor: 'divider', bgcolor: 'background.paper', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                              <Typography sx={{ fontSize: '0.65rem', fontWeight: 700 }}>
                                {id} — {CONTROL_NAMES[id] ?? id}
                              </Typography>
                              {isAutomatable ? (
                                <Chip
                                  label="PowerShell · Run as Admin"
                                  size="small"
                                  sx={{ fontSize: '0.55rem', fontWeight: 600, height: 18, bgcolor: '#EFF6FF', color: '#1D4ED8', border: '1px solid #BFDBFE' }}
                                />
                              ) : (
                                <Chip
                                  label="Guidance only"
                                  size="small"
                                  sx={{ fontSize: '0.55rem', fontWeight: 600, height: 18, bgcolor: '#F8FAFC', color: '#64748B', border: '1px solid #E2E8F0' }}
                                />
                              )}
                            </Box>
                          </Box>

                          {/* Accordion body */}
                          <Box sx={{ p: 2, display: 'grid', gridTemplateColumns: r?.gaps?.length ? '1fr 1.2fr' : '1fr', gap: 2, bgcolor: '#F8FAFC' }}>
                            {r?.gaps && r.gaps.length > 0 && (
                              <Box>
                                <Typography sx={{ fontSize: '0.55rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '1px', color: 'text.disabled', mb: 0.75 }}>
                                  Evidence gaps
                                </Typography>
                                {r.gaps.map((gap: string) => (
                                  <Box key={gap} sx={{ display: 'flex', gap: 0.75, mb: 0.5 }}>
                                    <Typography sx={{ fontSize: '0.58rem', color: '#DC2626', fontWeight: 700, flexShrink: 0 }}>✕</Typography>
                                    <Typography sx={{ fontSize: '0.62rem', color: '#DC2626' }}>{gap.replace(/_/g, ' ')}</Typography>
                                  </Box>
                                ))}
                              </Box>
                            )}
                            {isAutomatable ? (
                              <Box>
                                <Typography sx={{ fontSize: '0.55rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '1px', color: 'text.disabled', mb: 0.75 }}>
                                  Script preview
                                </Typography>
                                <Box sx={{ bgcolor: '#F1F5F9', border: '1px solid #E2E8F0', borderRadius: 1.5, p: 1.5, fontFamily: '"SF Mono","Fira Code",monospace', fontSize: '0.58rem', lineHeight: 1.8, color: '#334155' }}>
                                  <Box component="span" sx={{ color: '#94A3B8', fontStyle: 'italic', display: 'block' }}>
                                    {'# ' + id + ' Remediation — run as Administrator'}
                                  </Box>
                                  <Box component="span" sx={{ color: '#1D4ED8', fontWeight: 600, fontSize: '0.58rem', display: 'block', mt: 0.5 }}>
                                    {SCRIPT_ACTIONS[id] ?? 'See downloaded .ps1 for full script'}
                                  </Box>
                                </Box>
                              </Box>
                            ) : (
                              <Box>
                                <Typography sx={{ fontSize: '0.55rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '1px', color: 'text.disabled', mb: 0.75 }}>
                                  Steps to fix
                                </Typography>
                                <Typography sx={{ fontSize: '0.62rem', color: 'text.secondary' }}>
                                  Manual action required — see compliance documentation.
                                </Typography>
                              </Box>
                            )}
                          </Box>

                          {/* Accordion footer */}
                          <Box sx={{ px: 2, py: 1.25, borderTop: '1px solid', borderColor: 'divider', bgcolor: 'background.paper', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                            <Typography sx={{ fontSize: '0.6rem', color: 'text.disabled' }}>
                              {isAutomatable ? 'Reversible · Requires Admin' : 'Manual action required'}
                            </Typography>
                            {isAutomatable && isElectron && (() => {
                              const rs = remediationStates[id] ?? 'idle';
                              if (rs === 'idle' || rs === 'verification_failed') {
                                return (
                                  <Button
                                    size="small"
                                    variant="contained"
                                    disabled={!onDownloadScript}
                                    onClick={async () => {
                                      if (!onDownloadScript) return;
                                      const result = await onDownloadScript(id);
                                      if (result.success) {
                                        setRemediationStates(prev => ({ ...prev, [id]: 'downloaded' }));
                                      }
                                    }}
                                    sx={{ fontSize: '0.65rem', fontWeight: 600, px: 1.75, py: 0.625, borderRadius: 2, boxShadow: '0 1px 3px rgba(37,99,235,0.3)', textTransform: 'none' }}
                                  >
                                    Download .ps1
                                  </Button>
                                );
                              }
                              if (rs === 'downloaded') {
                                return (
                                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                                    <Typography sx={{ fontSize: '0.6rem', color: '#059669' }}>
                                      Downloaded — run the script, then re-scan
                                    </Typography>
                                    <Button
                                      size="small"
                                      disabled={!onRescan || remediationStates[id] === 'rescanning'}
                                      onClick={async () => {
                                        if (!onRescan) return;
                                        setRemediationStates(prev => ({ ...prev, [id]: 'rescanning' }));
                                        try {
                                          await onRescan();
                                          setRemediationStates(prev => ({ ...prev, [id]: 'verified' }));
                                          setExpandedId(null); // auto-close: control turned green
                                        } catch {
                                          setRemediationStates(prev => ({ ...prev, [id]: 'verification_failed' }));
                                        }
                                      }}
                                      sx={{ fontSize: '0.62rem', fontWeight: 600, px: 1.25, py: 0.5, bgcolor: '#F0FDF4', color: '#16A34A', border: '1px solid #BBF7D0', borderRadius: 1.5, textTransform: 'none', '&:hover': { bgcolor: '#DCFCE7' } }}
                                    >
                                      Re-scan now
                                    </Button>
                                  </Box>
                                );
                              }
                              if (rs === 'rescanning') {
                                return (
                                  <Typography sx={{ fontSize: '0.6rem', color: 'text.disabled' }}>Scanning...</Typography>
                                );
                              }
                              return null;
                            })()}
                          </Box>
                        </Box>
                      )}
                    </React.Fragment>
                  );
                })}
              </Box>
            );
          })
        )}
      </Box>
    </Paper>
  );
};

export default ControlHeatmap;
