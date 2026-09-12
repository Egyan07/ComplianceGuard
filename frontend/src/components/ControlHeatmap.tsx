import React, { useState } from 'react';
import { Box, Paper, Typography, LinearProgress, Chip, Button } from '@mui/material';
import { alpha, useTheme } from '@mui/material/styles';
import type { ControlResult } from '../services/api';
import StatusChip from './ui/StatusChip';
import EmptyState from './ui/EmptyState';
import Segmented from './ui/Segmented';
import { RADIUS, Tone, toneColors } from '../theme';

// ── Presentational helpers ──────────────────────────────────────────────────
// The Controls section is fully data-driven: rows, titles, and groupings come
// from the evaluation's control_results (control_title / control_category are
// emitted by both canonical engines from shared/frameworks/ — the single
// source of truth). Only display wording lives here.

// Per-framework header wording for the pre-evaluation state. Counts are NOT
// hardcoded here — the rendered count comes from the evaluation data.
const FRAMEWORK_META: Record<number, { name: string; unit: string }> = {
  1: { name: 'SOC 2 Type II', unit: 'criteria' },
  2: { name: 'ISO/IEC 27001:2022', unit: 'controls' },
  3: { name: 'HIPAA Security Rule', unit: 'safeguards' },
  4: { name: 'GDPR', unit: 'obligations' },
};

// Human-readable group headers for the category codes used by the canonical
// frameworks. GDPR uses bare article numbers ("5" → "Article 5"); anything
// unknown falls back to the raw code.
const CATEGORY_LABELS: Record<string, string> = {
  CC: 'Common Criteria (CC)',
  A: 'Availability (A)',
  C: 'Confidentiality (C)',
  PI: 'Processing Integrity (PI)',
  'A.5': 'Organizational Controls (A.5)',
  'A.6': 'People Controls (A.6)',
  'A.7': 'Physical Controls (A.7)',
  'A.8': 'Technological Controls (A.8)',
  '164.308': 'Administrative Safeguards (164.308)',
  '164.310': 'Physical Safeguards (164.310)',
  '164.312': 'Technical Safeguards (164.312)',
  '164.314': 'Organizational Requirements (164.314)',
  '164.316': 'Documentation Safeguards (164.316)',
};

const categoryLabel = (cat: string): string =>
  /^\d+$/.test(cat) ? `Article ${cat}` : CATEGORY_LABELS[cat] ?? cat;

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
// 'script' entries in electron/processing/remediation-scripts.js. The scripts
// themselves are SOC 2-mapped (each was remapped to the TSC criterion it
// substantively supports), so the one-click fix is offered for SOC 2 only;
// other frameworks get guidance.
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
  selectedFramework?: number;
  onDownloadScript?: (controlId: string) => Promise<{ success?: boolean; file_name?: string; canceled?: boolean; error?: string }>;
  onRescan?: () => Promise<void>;
}

export type RemediationState = 'idle' | 'downloaded' | 'rescanning' | 'verified' | 'verification_failed';

const ControlHeatmap: React.FC<ControlHeatmapProps> = ({
  controlResults,
  isElectron,
  isProTier,
  selectedFramework = 1,
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

  // ── Data-driven structure (Phase B) ─────────────────────────────────────
  // Groups and titles come from the evaluation itself: both canonical engines
  // stamp control_category / control_title onto every result from the
  // canonical YAML, and preserve the framework's own ordering. No per-
  // framework control lists are maintained in the UI anymore.
  const groups = (() => {
    if (!controlResults) return [] as { label: string; ids: string[] }[];
    const byCat: Record<string, string[]> = {};
    for (const [id, r] of Object.entries(controlResults)) {
      const cat = r.control_category || '—';
      (byCat[cat] ??= []).push(id);
    }
    return Object.entries(byCat).map(([cat, ids]) => ({ label: categoryLabel(cat), ids }));
  })();
  const titleFor = (id: string): string => controlResults?.[id]?.control_title || id;
  const meta = FRAMEWORK_META[selectedFramework] ?? FRAMEWORK_META[1];
  const assessedCount = controlResults ? Object.keys(controlResults).length : null;

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
            {meta.name}{assessedCount != null ? ` · ${assessedCount} ${meta.unit}` : ''}
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
          groups.map(cat => {
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
                          {titleFor(id)}
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
                                {id} — {titleFor(id)}
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
