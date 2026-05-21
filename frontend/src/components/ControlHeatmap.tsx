import React, { useState } from 'react';
import { Box, Paper, Typography, LinearProgress, Chip } from '@mui/material';
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
  isElectron: _isElectron,
  isProTier,
}) => {
  const [filter, setFilter] = useState<Filter>('all');

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
          {([['all', 'All'], ['failing', 'Failing'], ['partial', 'Partial Only']] as [Filter, string][]).map(([f, label]) => (
            <Chip
              key={f}
              label={label}
              size="small"
              onClick={() => setFilter(f)}
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
              const status = (controlResults[id]?.status ?? 'not_assessed') as StatusKey;
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
                  const status = (r?.status ?? 'not_assessed') as StatusKey;
                  const cfg = STATUS_CONFIG[status];
                  const score = r?.score ?? 0;
                  const isFail = status === 'non_compliant';

                  return (
                    <Box
                      key={id}
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
                    </Box>
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
