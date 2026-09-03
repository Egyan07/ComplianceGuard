import React from 'react';
import { Box, Card, CardContent, Skeleton, Typography } from '@mui/material';
import { EvidenceSummary, ComplianceEvaluation } from '../../services/api';

interface Props {
  summary: EvidenceSummary | null;
  evaluation: ComplianceEvaluation | null;
  isElectron: boolean;
}

const MetricBlock: React.FC<{ value: number; label: string; color: string }> = ({ value, label, color }) => (
  <Box sx={{ textAlign: 'center' }}>
    <Typography
      sx={{
        fontSize: '2.1rem',
        fontWeight: 750,
        letterSpacing: '-1.2px',
        color,
        lineHeight: 1.1,
        fontVariantNumeric: 'tabular-nums',
      }}
    >
      {value}
    </Typography>
    <Typography
      sx={{
        fontSize: '0.72rem',
        fontWeight: 600,
        letterSpacing: '0.2px',
        color: 'text.secondary',
        mt: 0.5,
        lineHeight: 1.4,
      }}
    >
      {label}
    </Typography>
  </Box>
);

const CollectionSummary: React.FC<Props> = ({ summary, evaluation, isElectron }) => {
  return (
    <Card
      sx={{
        height: '100%',
        minHeight: 280,
        borderTop: '3px solid transparent',
      }}
    >
      <CardContent sx={{ p: 3, height: '100%', display: 'flex', flexDirection: 'column' }}>
        <Typography variant="h6" sx={{ mb: 2 }}>
          {isElectron ? 'Local Collection Summary' : 'Collection Summary'}
        </Typography>
        {summary ? (
          <>
            <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 2 }}>
              <MetricBlock value={summary.total_collections} label="Total Evidence Items" color="primary.main" />
              <MetricBlock value={evaluation?.compliant_controls ?? 0} label="Compliant Controls" color="success.main" />
              <MetricBlock value={evaluation?.partial_controls ?? 0} label="Partial Controls" color="warning.main" />
              <MetricBlock value={evaluation?.non_compliant_controls ?? 0} label="Non-Compliant" color="error.main" />
            </Box>
            <Box sx={{ mt: 'auto', pt: 2 }}>
              {summary.last_collection && (
                <Typography sx={{ fontSize: '0.72rem', color: 'text.secondary' }}>
                  Last collection: {new Date(summary.last_collection).toLocaleDateString()}
                </Typography>
              )}
              {evaluation && (
                <Typography sx={{ fontSize: '0.72rem', color: 'text.secondary', mt: 0.25 }}>
                  Total controls: {evaluation.total_controls} · Not assessed: {evaluation.not_assessed_controls}
                </Typography>
              )}
            </Box>
          </>
        ) : (
          <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 2 }}>
            {[0, 1, 2, 3].map(i => (
              <Skeleton key={i} variant="rounded" height={70} />
            ))}
          </Box>
        )}
      </CardContent>
    </Card>
  );
};

export default CollectionSummary;
