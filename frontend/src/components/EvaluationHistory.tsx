/*
Evaluation History Component

Shows past compliance evaluations as a timeline with score trends,
status indicators, and the ability to view details of each evaluation.
*/

import React, { useState, useEffect } from 'react';
import {
  Box,
  Container,
  Paper,
  Typography,
  Button,
  CircularProgress,
  Alert,
  Chip,
  Divider,
  LinearProgress
} from '@mui/material';
import {
  Timeline,
  Assessment,
  Refresh,
  CheckCircle,
  Warning,
  Error as ErrorIcon,
  HelpOutlined
} from '@mui/icons-material';

import { useLicense } from '../contexts/LicenseContext';
import ScoreTrend from './ScoreTrend';
import { getScoreTrend, evaluationHistoryToTrend } from '../services/api';
import type { TrendPoint } from '../services/api';
import type { Recommendation } from '../services/api.types';
import { getElectronAPI, isElectronMode } from '../services/electron';
import { getErrorMessage } from '../lib/errors';

const isElectron = isElectronMode();

interface EvaluationRecord {
  id: number;
  framework_id: number;
  evaluation_date: string;
  overall_score: number;
  status: string;
  findings: {
    overall_score?: number;
    status?: string;
    total_controls?: number;
    compliant_controls?: number;
    partial_controls?: number;
    non_compliant_controls?: number;
    not_assessed_controls?: number;
    category_scores?: Record<string, unknown>;
    recommendations?: Recommendation[];
  };
}

interface EvaluationHistoryProps {
  onNavigate?: (page: string) => void;
}

const EvaluationHistory: React.FC<EvaluationHistoryProps> = ({ onNavigate }) => {
  const { isFeatureAllowed } = useLicense();
  const [evaluations, setEvaluations] = useState<EvaluationRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedFramework, setSelectedFramework] = useState<1 | 2 | 3 | 4>(1);
  const [trendPoints, setTrendPoints] = useState<TrendPoint[]>([]);
  const [trendLoading, setTrendLoading] = useState(false);

  const fetchHistory = async (frameworkId: 1 | 2 | 3 | 4) => {
    setLoading(true);
    setTrendLoading(true);
    setError(null);
    setEvaluations([]);
    setTrendPoints([]);
    try {
      if (isElectron) {
        // Fetch history once and derive the trend locally — getScoreTrend would
        // otherwise fetch the same history a second time.
        const api = getElectronAPI();
        const history = await api.getEvaluationHistory(frameworkId);
        if (history && !Array.isArray(history)) {
          setError(history.error);
        } else {
          const rows = history ?? [];
          setEvaluations(rows);
          setTrendPoints(evaluationHistoryToTrend(rows));
        }
      } else {
        const trend = await getScoreTrend(frameworkId);
        setTrendPoints(trend);
      }
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setLoading(false);
      setTrendLoading(false);
    }
  };

  useEffect(() => {
    fetchHistory(selectedFramework);
  }, [selectedFramework]);

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'compliant': return <CheckCircle sx={{ color: '#66BB6A' }} />;
      case 'partial': return <Warning sx={{ color: '#FFA726' }} />;
      case 'non_compliant': return <ErrorIcon sx={{ color: '#EF5350' }} />;
      default: return <HelpOutlined sx={{ color: '#9E9E9E' }} />;
    }
  };

  const getStatusColor = (status: string): 'success' | 'warning' | 'error' | 'default' => {
    switch (status) {
      case 'compliant': return 'success';
      case 'partial': return 'warning';
      case 'non_compliant': return 'error';
      default: return 'default';
    }
  };

  const getScoreColor = (score: number) => {
    if (score >= 90) return '#66BB6A';
    if (score >= 70) return '#FFA726';
    return '#EF5350';
  };


  if (!isFeatureAllowed('evaluation_history')) {
    return (
      <Container maxWidth="lg" sx={{ mt: 4, mb: 4 }}>
        <Typography variant="h4" component="h1" sx={{ fontWeight: 'bold', mb: 3 }}>
          Evaluation History
        </Typography>
        <Paper sx={{ p: 6, textAlign: 'center' }}>
          <Assessment sx={{ fontSize: 60, color: 'text.disabled', mb: 2 }} />
          <Typography variant="h6" color="text.secondary" gutterBottom>
            Track your compliance over time
          </Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
            Evaluation history and score trends are available with a Pro license.
          </Typography>
          <Button variant="contained" onClick={() => onNavigate?.('settings')}>
            Upgrade to Pro
          </Button>
        </Paper>
      </Container>
    );
  }

  return (
    <Container maxWidth="lg" sx={{ mt: 4, mb: 4 }}>
      <Box sx={{ display: 'flex', justifyContent: 'flex-end', alignItems: 'center', mb: 3 }}>
        <Button
          variant="outlined"
          startIcon={<Refresh />}
          onClick={() => fetchHistory(selectedFramework)}
          disabled={loading}
        >
          Refresh
        </Button>
      </Box>

      {error && (
        <Alert severity="error" sx={{ mb: 3 }}>{error}</Alert>
      )}

      {loading ? (
        <Box sx={{ display: 'flex', justifyContent: 'center', py: 8 }}>
          <CircularProgress size={50} />
        </Box>
      ) : !isElectron ? (
        <>
          <ScoreTrend
            evaluations={trendPoints}
            loading={trendLoading}
            selectedFramework={selectedFramework}
            onFrameworkChange={(fw) => setSelectedFramework(fw)}
          />
          <Alert severity="info">
            Evaluation history requires the desktop application.
          </Alert>
        </>
      ) : (
        <>
          <ScoreTrend
            evaluations={trendPoints}
            loading={trendLoading}
            selectedFramework={selectedFramework}
            onFrameworkChange={(fw) => setSelectedFramework(fw)}
          />
          {evaluations.length === 0 ? (
            <Paper sx={{ p: 6, textAlign: 'center' }}>
              <Assessment sx={{ fontSize: 60, color: 'text.disabled', mb: 2 }} />
              <Typography variant="h6" color="text.secondary" gutterBottom>
                No evaluations yet
              </Typography>
              <Typography variant="body2" color="text.secondary">
                Go to the Dashboard, collect evidence, and run "Evaluate Compliance" to see results here.
              </Typography>
            </Paper>
          ) : (
            <Paper>
              <Box sx={{ p: 2, borderBottom: 1, borderColor: 'divider' }}>
                <Typography variant="h6" sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                  <Timeline color="primary" />
                  All Evaluations ({evaluations.length})
                </Typography>
              </Box>

              {evaluations.map((eval_, index) => {
                const score = Math.round(eval_.overall_score || eval_.findings?.overall_score || 0);
                const findings = eval_.findings || {};

                return (
                  <React.Fragment key={eval_.id || index}>
                    <Box
                      sx={{
                        p: 3,
                        borderLeft: '2px solid', borderColor: 'divider', pl: 2,
                        '&:hover': { backgroundColor: 'action.hover' },
                      }}
                    >
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                        {/* Status icon */}
                        {getStatusIcon(eval_.status || findings.status || 'not_assessed')}

                        {/* Main content */}
                        <Box sx={{ flex: 1 }}>
                          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 0.5 }}>
                            <Typography variant="subtitle1" sx={{ fontWeight: 600 }}>
                              {new Date(eval_.evaluation_date).toLocaleDateString('en-US', {
                                year: 'numeric', month: 'long', day: 'numeric'
                              })}
                            </Typography>
                            <Chip
                              label={(eval_.status || findings.status || 'not assessed').replace(/_/g, ' ').toUpperCase()}
                              size="small"
                              color={getStatusColor(eval_.status || findings.status || '')}
                              variant="outlined"
                            />
                          </Box>

                          {/* Control breakdown */}
                          <Box sx={{ display: 'flex', gap: 3, mt: 1 }}>
                            <Typography variant="body2" color="text.secondary">
                              Controls: <strong>{findings.total_controls || 0}</strong>
                            </Typography>
                            <Typography variant="body2" sx={{ color: '#66BB6A' }}>
                              Compliant: <strong>{findings.compliant_controls || 0}</strong>
                            </Typography>
                            <Typography variant="body2" sx={{ color: '#FFA726' }}>
                              Partial: <strong>{findings.partial_controls || 0}</strong>
                            </Typography>
                            <Typography variant="body2" sx={{ color: '#EF5350' }}>
                              Non-compliant: <strong>{findings.non_compliant_controls || 0}</strong>
                            </Typography>
                          </Box>

                          {/* Score bar */}
                          <Box sx={{ mt: 1.5, display: 'flex', alignItems: 'center', gap: 1 }}>
                            <LinearProgress
                              variant="determinate"
                              value={score}
                              sx={{
                                flex: 1,
                                height: 6,
                                borderRadius: 3,
                                backgroundColor: 'rgba(0,0,0,0.08)',
                                '& .MuiLinearProgress-bar': {
                                  backgroundColor: getScoreColor(score),
                                  borderRadius: 3
                                }
                              }}
                            />
                          </Box>
                        </Box>

                        {/* Score */}
                        <Box sx={{ textAlign: 'center', minWidth: 80 }}>
                          <Typography
                            variant="h4"
                            sx={{ fontWeight: 700, color: getScoreColor(score), lineHeight: 1 }}
                          >
                            {score}%
                          </Typography>
                          <Typography variant="caption" color="text.secondary">
                            score
                          </Typography>
                        </Box>
                      </Box>

                      {/* Recommendations count */}
                      {findings.recommendations && findings.recommendations.length > 0 && (
                        <Box sx={{ mt: 1.5, ml: 5 }}>
                          <Typography variant="caption" color="text.secondary">
                            {findings.recommendations.filter((r: Recommendation) => r.priority === 'high').length} high priority
                            {' / '}
                            {findings.recommendations.length} total recommendations
                          </Typography>
                        </Box>
                      )}
                    </Box>
                    {index < evaluations.length - 1 && <Divider />}
                  </React.Fragment>
                );
              })}
            </Paper>
          )}
        </>
      )}
    </Container>
  );
};

export default EvaluationHistory;
