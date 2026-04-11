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
import { ComplianceMetrics } from '../services/api';

interface ComplianceScoreProps {
  metrics: ComplianceMetrics;
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
  loading = false
}) => {
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

  const overallStatus = getOverallStatus(metrics.overall_compliance_score);

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
            label={overallStatus.label}
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
              {metrics.overall_compliance_score}%
            </Typography>
            <Typography variant="body2" color="text.secondary">
              Overall Compliance
            </Typography>
          </Box>
        </Box>

        <Box>
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
        </Box>

        <Box sx={{ mt: 3, pt: 2, borderTop: 1, borderColor: 'divider' }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
            <Info color="info" fontSize="small" />
            <Typography variant="body2" color="text.secondary">
              Last Updated: {new Date().toLocaleDateString()}
            </Typography>
          </Box>
          <Typography variant="body2" color="text.secondary">
            Scores are calculated based on automated evidence collection and analysis.
          </Typography>
        </Box>
      </CardContent>
    </Card>
  );
};

export default ComplianceScore;
