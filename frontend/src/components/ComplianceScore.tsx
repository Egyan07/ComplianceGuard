/*
Compliance Score Component

Displays compliance metrics with visual progress indicators using Material-UI.
Shows overall compliance score and individual category scores.
*/

import React from 'react';
import {
  Card,
  CardContent,
  Typography,
  Box,
  LinearProgress,
  Chip,
  Tooltip
} from '@mui/material';
import {
  CheckCircle,
  Warning,
  Error,
  Info
} from '@mui/icons-material';
import { ComplianceMetrics, ComplianceEvaluation } from '../services/api';
import { useLicense } from '../contexts/LicenseContext';

interface ComplianceScoreProps {
  metrics: ComplianceMetrics;
  evaluation?: ComplianceEvaluation | null;
  loading?: boolean;
}

interface ScoreIndicatorProps {
  score: number;
  label: string;
  description: string;
}

const ScoreIndicator: React.FC<ScoreIndicatorProps> = ({
  score,
  label,
  description
}) => {
  const getColor = (score: number) => {
    if (score >= 90) return 'success';
    if (score >= 70) return 'warning';
    return 'error';
  };

  const getIcon = (score: number) => {
    if (score >= 90) return <CheckCircle color="success" />;
    if (score >= 70) return <Warning color="warning" />;
    return <Error color="error" />;
  };

  const progressColor = getColor(score);

  return (
    <Tooltip title={description} arrow>
      <Box sx={{ mb: 3 }}>
        <Box
          sx={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            mb: 1
          }}
        >
          <Typography variant="subtitle1" sx={{ fontWeight: 'medium' }}>
            {label}
          </Typography>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            {getIcon(score)}
            <Typography variant="h6" sx={{ fontWeight: 'bold' }}>
              {score}%
            </Typography>
          </Box>
        </Box>
        <LinearProgress
          variant="determinate"
          value={score}
          color={progressColor as 'success' | 'warning' | 'error'}
          sx={{
            height: 8,
            borderRadius: 4,
            backgroundColor: 'rgba(0,0,0,0.1)'
          }}
        />
      </Box>
    </Tooltip>
  );
};

const ComplianceScore: React.FC<ComplianceScoreProps> = ({
  metrics,
  evaluation,
  loading = false
}) => {
  const { isFeatureAllowed } = useLicense();
  const showDetails = isFeatureAllowed('per_control_scoring');
  if (loading) {
    return (
      <Card sx={{ height: '100%' }}>
        <CardContent>
          <Typography variant="h6" gutterBottom>
            Compliance Score
          </Typography>
          <Box sx={{ display: 'flex', justifyContent: 'center', py: 4 }}>
            <Typography>Loading compliance data...</Typography>
          </Box>
        </CardContent>
      </Card>
    );
  }

  const getOverallStatus = (score: number) => {
    if (score >= 90) return { label: 'Excellent', color: 'success' };
    if (score >= 80) return { label: 'Good', color: 'primary' };
    if (score >= 70) return { label: 'Fair', color: 'warning' };
    return { label: 'Poor', color: 'error' };
  };

  const displayScore = evaluation
    ? Math.round(evaluation.overall_score)
    : metrics.overall_compliance_score;
  const overallStatus = getOverallStatus(displayScore);

  return (
    <Card sx={{ height: '100%', minHeight: 400 }}>
      <CardContent>
        <Box
          sx={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            mb: 3
          }}
        >
          <Typography variant="h6" component="h2">
            Compliance Score
          </Typography>
          <Chip
            label={evaluation ? evaluation.status.replace('_', ' ').toUpperCase() : overallStatus.label}
            color={overallStatus.color as 'success' | 'primary' | 'warning' | 'error'}
            variant="filled"
          />
        </Box>

        <Box
          sx={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            mb: 4,
            p: 3,
            backgroundColor: 'rgba(0,0,0,0.02)',
            borderRadius: 2
          }}
        >
          <Box sx={{ textAlign: 'center' }}>
            <Typography variant="h2" sx={{ fontWeight: 'bold' }} color="primary">
              {displayScore}%
            </Typography>
            <Typography variant="body2" color="text.secondary">
              Overall Compliance
            </Typography>
          </Box>
        </Box>

        <Box>
          {showDetails && evaluation && evaluation.category_scores ? (
            Object.entries(evaluation.category_scores).map(([category, data]: [string, any]) => (
              <ScoreIndicator
                key={category}
                score={Math.round(data.score || 0)}
                label={category}
                description={`${data.control_count || 0} controls evaluated`}
              />
            ))
          ) : evaluation && !showDetails ? (
            <Box sx={{ textAlign: 'center', py: 3, px: 2, backgroundColor: '#EFF6FF', borderRadius: 2 }}>
              <Typography variant="body2" sx={{ color: '#1E40AF' }}>
                Upgrade to Pro to see per-control scoring, gap analysis, and remediation recommendations.
              </Typography>
              <Typography variant="caption" color="text.secondary" sx={{ mt: 1, display: 'block' }}>
                You're seeing results for 12 of 29 controls.
              </Typography>
            </Box>
          ) : (
            <>
              <ScoreIndicator
                score={metrics.s3_encryption_compliance}
                label="S3 Encryption Compliance"
                description="Percentage of S3 buckets with proper encryption enabled"
              />
              <ScoreIndicator
                score={metrics.iam_policy_compliance}
                label="IAM Policy Compliance"
                description="Percentage of IAM policies following security best practices"
              />
            </>
          )}
        </Box>

        <Box sx={{ mt: 3, pt: 2, borderTop: 1, borderColor: 'divider' }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
            <Info color="info" fontSize="small" />
            <Typography variant="body2" color="text.secondary">
              {evaluation
                ? `Last Evaluated: ${new Date(evaluation.evaluation_date || Date.now()).toLocaleDateString()}`
                : 'No evaluation yet. Collect evidence and run an evaluation.'}
            </Typography>
          </Box>
          <Typography variant="body2" color="text.secondary">
            Scores are calculated based on evidence coverage against SOC 2 controls.
          </Typography>
        </Box>
      </CardContent>
    </Card>
  );
};

export default ComplianceScore;
