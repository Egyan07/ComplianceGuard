import React from 'react';
import { Box, Skeleton, Typography } from '@mui/material';
import { useTheme } from '@mui/material/styles';
import MotionCard from '../ui/MotionCard';
import { EvidenceSummary, ComplianceEvaluation } from '../../services/api';

interface Props {
  summary: EvidenceSummary | null;
  evaluation: ComplianceEvaluation | null;
  isElectron: boolean;
}

const MetricBlock: React.FC<{ value: number; label: string; color: string }> = ({ value, label, color }) => (
  <Box sx={{ textAlign: 'center' }}>
    <Typography sx={{ fontSize: '2.2rem', fontWeight: 750, letterSpacing: '-1.5px', color, lineHeight: 1 }}>
      {value}
    </Typography>
    <Typography sx={{ fontSize: '0.65rem', fontWeight: 600, letterSpacing: '0.8px', textTransform: 'uppercase', color: 'text.secondary', mt: 0.25 }}>
      {label}
    </Typography>
  </Box>
);

const CollectionSummary: React.FC<Props> = ({ summary, evaluation, isElectron }) => {
  const theme = useTheme();
  const light = theme.palette.mode === 'light';

  return (
    <MotionCard
      sx={{
        height: '100%', minHeight: 280,
        borderTop: '3px solid transparent',
        position: 'relative', overflow: 'hidden',
        ...(light && {
          '&::before': {
            content: '""',
            position: 'absolute', inset: 0, zIndex: 0,
            backgroundImage: 'radial-gradient(circle, rgba(148,163,184,0.25) 1px, transparent 1px)',
            backgroundSize: '18px 18px',
            pointerEvents: 'none',
          },
        }),
      }}
    >
      <Box sx={{ p: 3, position: 'relative', zIndex: 1, height: '100%' }}>
        <Typography variant="h6" gutterBottom>
          {isElectron ? 'Local Collection Summary' : 'Collection Summary'}
        </Typography>
        {summary ? (
          <Box sx={{ mt: 2 }}>
            <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 2 }}>
              <MetricBlock value={summary.total_collections} label="Total Evidence Items" color="primary.main" />
              <MetricBlock value={evaluation?.compliant_controls ?? 0} label="Compliant Controls" color="success.main" />
              <MetricBlock value={evaluation?.partial_controls ?? 0} label="Partial Controls" color="warning.main" />
              <MetricBlock value={evaluation?.non_compliant_controls ?? 0} label="Non-Compliant" color="error.main" />
            </Box>
            {summary.last_collection && (
              <Box sx={{ mt: 3, pt: 2, borderTop: 1, borderColor: 'divider' }}>
                <Typography sx={{ fontSize: '0.72rem', color: 'text.disabled' }}>
                  Last Collection: {new Date(summary.last_collection).toLocaleDateString()}
                </Typography>
              </Box>
            )}
            {evaluation && (
              <Box sx={{ mt: 2, pt: 2, borderTop: 1, borderColor: 'divider' }}>
                <Typography sx={{ fontSize: '0.72rem', color: 'text.disabled' }}>
                  Total Controls: {evaluation.total_controls} · Not Assessed: {evaluation.not_assessed_controls}
                </Typography>
              </Box>
            )}
          </Box>
        ) : (
          <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 2, mt: 2 }}>
            {[0, 1, 2, 3].map(i => (
              <Skeleton key={i} variant="rounded" height={70} />
            ))}
          </Box>
        )}
      </Box>
    </MotionCard>
  );
};

export default CollectionSummary;
