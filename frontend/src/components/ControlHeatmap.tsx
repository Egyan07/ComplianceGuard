import React, { useState } from 'react';
import { Box, Paper, Typography, LinearProgress, Chip, Button } from '@mui/material';
import { alpha, useTheme } from '@mui/material/styles';
import type { ControlResult } from '../services/api';
import StatusChip from './ui/StatusChip';
import EmptyState from './ui/EmptyState';
import Segmented from './ui/Segmented';
import { RADIUS, Tone, toneColors } from '../theme';

// Real 2017 Trust Services Criteria labels — kept in sync with
// shared/frameworks/soc2_controls.yaml (43 criteria: 33 CC + A1.1-A1.3 +
// C1.1-C1.2 + PI1.1-PI1.5). There is no "CA" category in the TSC.
const CONTROL_NAMES: Record<string, string> = {
  'CC1.1':'Integrity and Ethical Values','CC1.2':'Board Oversight and Independence','CC1.3':'Organizational Structure and Reporting Lines','CC1.4':'Commitment to Competence','CC1.5':'Individual Accountability',
  'CC2.1':'Quality of Information','CC2.2':'Internal Communication','CC2.3':'External Communication',
  'CC3.1':'Objectives Specification','CC3.2':'Risk Identification and Analysis','CC3.3':'Fraud Consideration','CC3.4':'Change Risk Assessment',
  'CC4.1':'Ongoing and Separate Evaluations','CC4.2':'Evaluation and Communication of Deficiencies',
  'CC5.1':'Selection of Control Activities','CC5.2':'General Controls over Technology','CC5.3':'Deployment Through Policies and Procedures',
  'CC6.1':'Logical Access Security','CC6.2':'User Registration and Credential Management','CC6.3':'Access Authorization and Modification','CC6.4':'Physical Access Restrictions','CC6.5':'Disposal of Physical Assets','CC6.6':'Protection Against External Threats','CC6.7':'Restriction of Information Transmission','CC6.8':'Unauthorized and Malicious Software Controls',
  'CC7.1':'Configuration and Vulnerability Detection','CC7.2':'Anomaly Monitoring','CC7.3':'Security Event Evaluation','CC7.4':'Incident Response','CC7.5':'Recovery from Security Incidents',
  'CC8.1':'Change Management',
  'CC9.1':'Business Disruption Risk Mitigation','CC9.2':'Vendor and Business Partner Risk',
  'A1.1':'Processing Capacity Management','A1.2':'Environmental Protections, Backup, and Recovery Infrastructure','A1.3':'Recovery Plan Testing',
  'C1.1':'Identification and Maintenance of Confidential Information','C1.2':'Disposal of Confidential Information',
  'PI1.1':'Processing Information Quality','PI1.2':'Input Completeness and Accuracy','PI1.3':'System Processing Controls','PI1.4':'Output Delivery','PI1.5':'Storage of Inputs and Outputs',
};

const CATEGORIES: { label: string; ids: string[] }[] = [
  { label: 'Common Criteria (CC)', ids: ['CC1.1','CC1.2','CC1.3','CC1.4','CC1.5','CC2.1','CC2.2','CC2.3','CC3.1','CC3.2','CC3.3','CC3.4','CC4.1','CC4.2','CC5.1','CC5.2','CC5.3','CC6.1','CC6.2','CC6.3','CC6.4','CC6.5','CC6.6','CC6.7','CC6.8','CC7.1','CC7.2','CC7.3','CC7.4','CC7.5','CC8.1','CC9.1','CC9.2'] },
  { label: 'Availability (A)',     ids: ['A1.1','A1.2','A1.3'] },
  { label: 'Confidentiality (C)', ids: ['C1.1','C1.2'] },
  { label: 'Processing Integrity (PI)', ids: ['PI1.1','PI1.2','PI1.3','PI1.4','PI1.5'] },
];

type Filter = 'all' | 'failing' | 'partial';
type StatusKey = 'compliant' | 'non_compliant' | 'partial' | 'not_assessed';

const STATUS_TONE: Record<StatusKey, Tone> = {
  compliant: 'success',
  non_compliant: 'error',
  partial: 'warning',
  not_assessed: 'neutral',
};

const STATUS_LABEL: Record<StatusKey, string> = {
  compliant: 'Pass',
  non_compliant: 'Fail',
  partial: 'Partial',
  not_assessed: 'Not assessed',
};

// Controls with an automatable PowerShell remediation script — must match the
// 'script' entries in electron/processing/remediation-scripts.js.
const AUTOMATABLE_CONTROLS = new Set(['CC6.1','CC6.2','CC6.6','CC6.8','CC7.1','CC7.2']);

const SCRIPT_ACTIONS: Record<string, string> = {
  'CC6.1': 'netsh advfirewall set allprofiles state on',
  'CC6.2': 'secedit /configure — sets password policy (min 12 chars, 90-day expiry)',
  'CC6.6': 'netsh advfirewall firewall add rule — blocks Telnet/FTP/RDP-public',
  'CC6.8': 'Set-MpPreference — enables Defender RTP + Windows Update service',
  'CC7.1': 'wevtutil sl Security — sets 100MB log, enables process audit',
  'CC7.2': 'auditpol /set — enables logon + account management audit events',
};

export interface ControlHeatmapProps {
  controlResults: Record<string, ControlResult> | null;
  isElectron: boolean;
  isProTier: boolean;
  onDownloadScript?: (controlId: string) => Promise<{ success?: boolean; file_name?: string; canceled?: boolean; error?: string }>;
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
  const theme = useTheme();
  const [filter, setFilter] = useState<Filter>('all');
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [remediationStates, setRemediationStates] = useState<Record<string, RemediationState>>({});

  const filterRow = (status: StatusKey): boolean => {
    if (filter === 'failing') return status === 'non_compliant';
    if (filter === 'partial') return status === 'partial';
    return true;
  };

  const c = (tone: Tone) => toneColors(theme, tone);

  return (
    <Paper sx={{ borderRadius: RADIUS.lg, overflow: 'hidden', border: '1px solid', borderColor: 'divider' }}>
      {/* Header */}
      <Box
        sx={{
          px: 2.5,
          py: 1.75,
          borderBottom: '1px solid',
          borderColor: 'divider',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          flexWrap: 'wrap',
          gap: 1,
        }}
      >
        <Box sx={{ display: 'flex', alignItems: 'baseline', gap: 1.25, minWidth: 0 }}>
          <Typography sx={{ fontSize: '1rem', fontWeight: 700, color: 'text.primary', letterSpacing: '-0.2px' }}>
            Controls
          </Typography>
          <Typography sx={{ fontSize: '0.75rem', color: 'text.secondary', fontWeight: 500 }}>
            SOC 2 Type II · 43 criteria
          </Typography>
        </Box>
        <Segmented
          options={[
            { value: 'all' as Filter, label: 'All' },
            { value: 'failing' as Filter, label: 'Failing' },
            { value: 'partial' as Filter, label: 'Partial' },
          ]}
          value={filter}
          onChange={(f) => { setFilter(f); setExpandedId(null); }}
        />
      </Box>

      {/* Body */}
      <Box sx={{ px: 1.25, py: 0.75 }}>
        {!controlResults ? (
          <EmptyState
            dashed
            title="No evaluation results yet"
            description="Run an evaluation to see each control's status and score."
            sx={{ py: 5 }}
          />
        ) : !isProTier ? (
          <EmptyState
            title="Per-control breakdown requires Pro"
            description="Upgrade to unlock control-by-control scoring, evidence gaps, and remediation guidance."
            action={<Chip label="Upgrade to Pro" size="small" color="primary" variant="outlined" />}
            sx={{ py: 5 }}
          />
        ) : (
          CATEGORIES.map(cat => {
            const visibleIds = cat.ids.filter(id => {
              const status: StatusKey = controlResults[id]?.status ?? 'not_assessed';
              return filterRow(status);
            });
            if (visibleIds.length === 0) return null;
            // Live per-category posture summary — the group header carries the
            // state of its controls so rows stay quiet until they need you.
            const catCounts = { pass: 0, fail: 0, partial: 0, unassessed: 0 };
            cat.ids.forEach((id) => {
              const s = (controlResults[id]?.status ?? 'not_assessed') as StatusKey;
              if (s === 'compliant') catCounts.pass++;
              else if (s === 'non_compliant') catCounts.fail++;
              else if (s === 'partial') catCounts.partial++;
              else catCounts.unassessed++;
            });
            const needsAttention = catCounts.fail + catCounts.partial;
            return (
              <Box key={cat.label}>
                <Box
                  sx={{
                    display: 'flex',
                    alignItems: 'baseline',
                    gap: 1,
                    px: 1,
                    pt: 1.25,
                    pb: 0.5,
                  }}
                >
                  <Typography
                    sx={{ fontSize: '0.75rem', fontWeight: 700, color: 'text.primary', letterSpacing: '0.1px' }}
                  >
                    {cat.label}
                  </Typography>
                  {needsAttention > 0 ? (
                    <Typography
                      sx={{
                        fontSize: '0.7rem',
                        fontWeight: 600,
                        color: c(needsAttention === catCounts.fail ? 'error' : 'warning').main,
                      }}
                    >
                      {catCounts.fail} fail · {catCounts.partial} partial
                    </Typography>
                  ) : (
                    <Typography sx={{ fontSize: '0.7rem', fontWeight: 500, color: 'text.disabled' }}>
                      {catCounts.pass} pass
                    </Typography>
                  )}
                </Box>
                {visibleIds.map(id => {
                  const r = controlResults[id];
                  const status: StatusKey = r?.status ?? 'not_assessed';
                  const tone = STATUS_TONE[status];
                  const toneC = c(tone);
                  const score = Math.max(0, Math.min(100, r?.score ?? 0));
                  const isFail = status === 'non_compliant';
                  const isAutomatable = AUTOMATABLE_CONTROLS.has(id);
                  const failBg = alpha(theme.palette.error.main, theme.palette.mode === 'light' ? 0.04 : 0.06);

                  const isPartial = status === 'partial';
                  const isQuiet = status === 'compliant' || status === 'not_assessed';
                  // Row state rail: failing rows carry a red rail + faint wash,
                  // partial rows an amber rail. Compliant / not-assessed rows stay
                  // quiet — posture is read from the rail, not from more pills.
                  const railColor = isFail
                    ? alpha(theme.palette.error.main, theme.palette.mode === 'light' ? 0.9 : 0.85)
                    : isPartial
                      ? alpha(theme.palette.warning.main, theme.palette.mode === 'light' ? 0.9 : 0.85)
                      : 'transparent';

                  return (
                    <React.Fragment key={id}>
                      <Box
                        sx={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: 1.5,
                          px: 1.25,
                          py: 0.9,
                          borderRadius: '8px',
                          mb: 0.25,
                          flexWrap: { xs: 'wrap', md: 'nowrap' },
                          position: 'relative',
                          bgcolor: isFail ? failBg : isPartial ? alpha(theme.palette.warning.main, theme.palette.mode === 'light' ? 0.035 : 0.05) : 'transparent',
                          '&:hover': { bgcolor: isFail ? failBg : isPartial ? alpha(theme.palette.warning.main, 0.06) : 'action.hover' },
                        }}
                      >
                        {/* State rail */}
                        <Box
                          sx={{
                            position: 'absolute',
                            left: 0,
                            top: 5,
                            bottom: 5,
                            width: 2.5,
                            borderRadius: RADIUS.pill,
                            bgcolor: railColor,
                            opacity: isQuiet ? 0 : 1,
                          }}
                        />
                        <Typography
                          sx={{
                            fontSize: '0.75rem',
                            fontWeight: 700,
                            fontVariantNumeric: 'tabular-nums',
                            letterSpacing: '0.1px',
                            color: isFail ? 'error.main' : isPartial ? 'warning.main' : 'text.primary',
                            width: 48,
                            flexShrink: 0,
                          }}
                        >
                          {id}
                        </Typography>
                        <Typography
                          sx={{
                            fontSize: '0.8125rem',
                            fontWeight: isFail ? 600 : 500,
                            color: isFail ? 'text.primary' : 'text.secondary',
                            flex: 1,
                            minWidth: 120,
                            lineHeight: 1.4,
                          }}
                        >
                          {CONTROL_NAMES[id] ?? id}
                        </Typography>
                        <Box sx={{ width: { xs: '100%', md: 90 }, flexShrink: 0, order: { xs: 4, md: 0 } }}>
                          <LinearProgress
                            variant="determinate"
                            value={score}
                            aria-label={`${id} evidence coverage: ${Math.round(score)} percent`}
                            sx={{ height: 5, '& .MuiLinearProgress-bar': { bgcolor: toneC.main } }}
                          />
                        </Box>
                        <Typography
                          sx={{
                            fontSize: '0.72rem',
                            color: isFail ? 'error.main' : 'text.secondary',
                            width: 40,
                            textAlign: 'right',
                            flexShrink: 0,
                            fontVariantNumeric: 'tabular-nums',
                          }}
                        >
                          {Math.round(score)}%
                        </Typography>
                        <StatusChip tone={tone} label={STATUS_LABEL[status]} size="sm" />
                        {(status === 'non_compliant' || status === 'partial') && (
                          isElectron && isAutomatable
                            ? (
                              <Button
                                size="small"
                                aria-expanded={expandedId === id}
                                aria-controls={`accordion-${id}`}
                                onClick={() => setExpandedId(prev => prev === id ? null : id)}
                                sx={{
                                  fontSize: '0.72rem',
                                  fontWeight: 600,
                                  px: 1.25,
                                  height: 26,
                                  minWidth: 0,
                                  bgcolor: c('info').surface,
                                  color: c('info').onSurface,
                                  border: `1px solid ${c('info').border}`,
                                  borderRadius: RADIUS.sm,
                                  flexShrink: 0,
                                  textTransform: 'none',
                                  '&:hover': { bgcolor: c('info').surface, filter: 'brightness(0.97)' },
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
                                  fontSize: '0.72rem',
                                  fontWeight: 600,
                                  px: 1.25,
                                  height: 26,
                                  minWidth: 0,
                                  bgcolor: c('warning').surface,
                                  color: c('warning').onSurface,
                                  border: `1px solid ${c('warning').border}`,
                                  borderRadius: RADIUS.sm,
                                  flexShrink: 0,
                                  textTransform: 'none',
                                  '&:hover': { bgcolor: c('warning').surface, filter: 'brightness(0.97)' },
                                }}
                              >
                                How to fix
                              </Button>
                            )
                        )}
                      </Box>
                      {expandedId === id && (status === 'non_compliant' || status === 'partial') && (
                        <Box
                          id={`accordion-${id}`}
                          role="region"
                          aria-label={`${id} remediation details`}
                          sx={{
                            mx: 0.5,
                            mb: 1,
                            border: '1px solid',
                            borderColor: 'divider',
                            borderRadius: RADIUS.md,
                            overflow: 'hidden',
                          }}
                        >
                          <Box
                            sx={{
                              px: 2,
                              py: 1.25,
                              borderBottom: '1px solid',
                              borderColor: 'divider',
                              bgcolor: 'background.paper',
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'space-between',
                              flexWrap: 'wrap',
                              gap: 1,
                            }}
                          >
                            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                              <Typography sx={{ fontSize: '0.8rem', fontWeight: 700 }}>
                                {id} — {CONTROL_NAMES[id] ?? id}
                              </Typography>
                              {isAutomatable ? (
                                <StatusChip tone="info" label="PowerShell · Run as Admin" size="sm" />
                              ) : (
                                <StatusChip tone="neutral" label="Guidance only" size="sm" />
                              )}
                            </Box>
                          </Box>

                          <Box
                            sx={{
                              p: 2,
                              display: 'grid',
                              gridTemplateColumns: { xs: '1fr', md: r?.gaps?.length ? '1fr 1.2fr' : '1fr' },
                              gap: 2,
                              bgcolor: theme.palette.mode === 'light' ? '#F8FAFC' : 'rgba(255,255,255,0.02)',
                            }}
                          >
                            {r?.gaps && r.gaps.length > 0 && (
                              <Box>
                                <Typography
                                  sx={{
                                    fontSize: '0.72rem',
                                    fontWeight: 650,
                                    color: 'text.secondary',
                                    mb: 0.75,
                                  }}
                                >
                                  Evidence gaps
                                </Typography>
                                {r.gaps.map((gap: string) => (
                                  <Box key={gap} sx={{ display: 'flex', gap: 0.75, mb: 0.5 }}>
                                    <Typography sx={{ fontSize: '0.75rem', color: 'error.main', fontWeight: 700, flexShrink: 0 }}>✕</Typography>
                                    <Typography sx={{ fontSize: '0.8125rem', color: 'error.main', lineHeight: 1.5 }}>
                                      {gap.replace(/_/g, ' ')}
                                    </Typography>
                                  </Box>
                                ))}
                              </Box>
                            )}
                            {isAutomatable ? (
                              <Box>
                                <Typography
                                  sx={{
                                    fontSize: '0.72rem',
                                    fontWeight: 650,
                                    color: 'text.secondary',
                                    mb: 0.75,
                                  }}
                                >
                                  Script preview
                                </Typography>
                                <Box
                                  sx={{
                                    bgcolor: c('neutral').surface,
                                    border: '1px solid',
                                    borderColor: 'divider',
                                    borderRadius: RADIUS.md,
                                    p: 1.5,
                                    fontFamily: '"SF Mono","Fira Code",ui-monospace,monospace',
                                    fontSize: '0.72rem',
                                    lineHeight: 1.7,
                                    color: 'text.secondary',
                                  }}
                                >
                                  <Box component="span" sx={{ color: 'text.secondary', fontStyle: 'italic', display: 'block' }}>
                                    {'# ' + id + ' Remediation — run as Administrator'}
                                  </Box>
                                  <Box
                                    component="span"
                                    sx={{
                                      color: c('info').onSurface,
                                      fontWeight: 600,
                                      display: 'block',
                                      mt: 0.5,
                                    }}
                                  >
                                    {SCRIPT_ACTIONS[id] ?? 'See downloaded .ps1 for full script'}
                                  </Box>
                                </Box>
                              </Box>
                            ) : (
                              <Box>
                                <Typography
                                  sx={{
                                    fontSize: '0.72rem',
                                    fontWeight: 650,
                                    color: 'text.secondary',
                                    mb: 0.75,
                                  }}
                                >
                                  Steps to fix
                                </Typography>
                                <Typography sx={{ fontSize: '0.8125rem', color: 'text.secondary', lineHeight: 1.5 }}>
                                  Manual action required — see compliance documentation.
                                </Typography>
                              </Box>
                            )}
                          </Box>

                          <Box
                            sx={{
                              px: 2,
                              py: 1.25,
                              borderTop: '1px solid',
                              borderColor: 'divider',
                              bgcolor: 'background.paper',
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'space-between',
                              flexWrap: 'wrap',
                              gap: 1,
                            }}
                          >
                            <Typography sx={{ fontSize: '0.72rem', color: 'text.secondary' }}>
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
                                    sx={{ fontSize: '0.75rem', fontWeight: 600, px: 1.75, height: 30, textTransform: 'none' }}
                                  >
                                    Download .ps1
                                  </Button>
                                );
                              }
                              if (rs === 'downloaded') {
                                return (
                                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                                    <Typography sx={{ fontSize: '0.72rem', color: 'success.dark' }}>
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
                                      sx={{
                                        fontSize: '0.75rem',
                                        fontWeight: 600,
                                        px: 1.25,
                                        height: 28,
                                        bgcolor: c('success').surface,
                                        color: c('success').onSurface,
                                        border: `1px solid ${c('success').border}`,
                                        borderRadius: RADIUS.sm,
                                        textTransform: 'none',
                                        '&:hover': { bgcolor: c('success').surface, filter: 'brightness(0.97)' },
                                      }}
                                    >
                                      Re-scan now
                                    </Button>
                                  </Box>
                                );
                              }
                              if (rs === 'rescanning') {
                                return (
                                  <Typography sx={{ fontSize: '0.72rem', color: 'text.secondary' }}>Scanning...</Typography>
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
