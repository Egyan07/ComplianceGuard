import React from 'react';
import { Box, Skeleton, Typography } from '@mui/material';
import MotionCard from '../ui/MotionCard';
import { EvidenceSummary, ComplianceEvaluation } from '../../services/api';

interface Props {
  summary: EvidenceSummary | null;
  evaluation: ComplianceEvaluation | null;
  isElectron: boolean;
}

const CollectionSummary: React.FC<Props> = ({ summary, evaluation, isElectron }) => (
  <MotionCard sx={{ p: 3, height: '100%', minHeight: 400 }}>
    <Typography variant="h6" gutterBottom>
      {isElectron ? 'Local Collection Summary' : 'Collection Summary'}
    </Typography>
    {summary ? (
      <Box sx={{ mt: 2 }}>
        <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 2 }}>
          <Box sx={{ textAlign: 'center' }}>
            <Typography variant="h4" sx={{ color: 'primary.main', fontWeight: 'bold' }}>
              {summary.total_collections}
            </Typography>
            <Typography variant="body2" color="text.secondary">Total Evidence Items</Typography>
          </Box>
          <Box sx={{ textAlign: 'center' }}>
            <Typography variant="h4" sx={{ color: 'success.main', fontWeight: 'bold' }}>
              {evaluation?.compliant_controls || 0}
            </Typography>
            <Typography variant="body2" color="text.secondary">Compliant Controls</Typography>
          </Box>
          <Box sx={{ textAlign: 'center' }}>
            <Typography variant="h4" sx={{ color: 'warning.main', fontWeight: 'bold' }}>
              {evaluation?.partial_controls || 0}
            </Typography>
            <Typography variant="body2" color="text.secondary">Partial Controls</Typography>
          </Box>
          <Box sx={{ textAlign: 'center' }}>
            <Typography variant="h4" sx={{ color: 'error.main', fontWeight: 'bold' }}>
              {evaluation?.non_compliant_controls || 0}
            </Typography>
            <Typography variant="body2" color="text.secondary">Non-Compliant</Typography>
          </Box>
        </Box>
        {summary.last_collection && (
          <Box sx={{ mt: 3, pt: 2, borderTop: 1, borderColor: 'divider' }}>
            <Typography variant="body2" color="text.secondary">
              Last Collection: {new Date(summary.last_collection).toLocaleDateString()}
            </Typography>
          </Box>
        )}
        {evaluation && (
          <Box sx={{ mt: 2, pt: 2, borderTop: 1, borderColor: 'divider' }}>
            <Typography variant="body2" color="text.secondary">
              Total Controls: {evaluation.total_controls} | Not Assessed: {evaluation.not_assessed_controls}
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
  </MotionCard>
);

export default CollectionSummary;
