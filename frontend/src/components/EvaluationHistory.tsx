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
  LinearProgress,
  Tooltip
} from '@mui/material';
import {
  Timeline,
  TrendingUp,
  TrendingDown,
  TrendingFlat,
  Assessment,
  Refresh,
  CheckCircle,
  Warning,
  Error as ErrorIcon,
  HelpOutlined
} from '@mui/icons-material';

import { useLicense } from '../contexts/LicenseContext';

const isElectron = !!(window as any).electronAPI;

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
    category_scores?: Record<string, any>;
    recommendations?: Array<any>;
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

  const fetchHistory = async () => {
    if (!isElectron) {
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const api = (window as any).electronAPI;
      const history = await api.getEvaluationHistory(1);

      if (history?.error) {
        setError(history.error);
      } else {
        setEvaluations(Array.isArray(history) ? history : []);
      }
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchHistory();
  }, []);

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'compliant': return <CheckCircle sx={{ color: '#66BB6A' }} />;
      case 'partial': return <Warning sx={{ color: '#FFA726' }} />;
      case 'non_compliant': return <ErrorIcon sx={{ color: '#EF5350' }} />;
      default: return <HelpOutlined sx={{ color: '#9E9E9E' }} />;
    }
  };

  const getStatusColor = (status: string) => {
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

  const getTrendIcon = (index: number) => {
    if (index >= evaluations.length - 1) return <TrendingFlat sx={{ color: '#9E9E9E', fontSize: 20 }} />;

    const current = evaluations[index].overall_score || evaluations[index].findings?.overall_score || 0;
    const previous = evaluations[index + 1].overall_score || evaluations[index + 1].findings?.overall_score || 0;

    if (current > previous) return <TrendingUp sx={{ color: '#66BB6A', fontSize: 20 }} />;
    if (current < previous) return <TrendingDown sx={{ color: '#EF5350', fontSize: 20 }} />;
    return <TrendingFlat sx={{ color: '#9E9E9E', fontSize: 20 }} />;
  };

  // Simple score bar chart
  const ScoreChart: React.FC = () => {
    if (evaluations.length === 0) return null;

    const recentEvals = evaluations.slice(0, 10).reverse(); // oldest first for chart
    const maxScore = 100;

    return (
      <Paper sx={{ p: 3, mb: 3 }}>
        <Typography variant="h6" gutterBottom sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <TrendingUp color="primary" />
          Score Trend
        </Typography>
        <Box sx={{ display: 'flex', alignItems: 'flex-end', gap: 1, height: 180, mt: 2, px: 1 }}>
          {recentEvals.map((eval_, i) => {
            const score = Math.round(eval_.overall_score || eval_.findings?.overall_score || 0);
            const height = Math.max(4, (score / maxScore) * 160);

            return (
              <Tooltip
                key={eval_.id || i}
                title={`${new Date(eval_.evaluation_date).toLocaleDateString()} — ${score}%`}
              >
                <Box sx={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                  <Typography variant="caption" sx={{ fontWeight: 600, mb: 0.5, color: getScoreColor(score) }}>
                    {score}%
                  </Typography>
                  <Box
                    sx={{
                      width: '100%',
                      maxWidth: 50,
                      height: height,
                      backgroundColor: getScoreColor(score),
                      borderRadius: '4px 4px 0 0',
                      opacity: 0.85,
                      transition: 'height 0.3s',
                      '&:hover': { opacity: 1 }
                    }}
                  />
                  <Typography variant="caption" sx={{ mt: 0.5, color: 'text.secondary', fontSize: '0.65rem' }}>
                    {new Date(eval_.evaluation_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                  </Typography>
                </Box>
              </Tooltip>
            );
          })}
        </Box>
        {recentEvals.length >= 2 && (
          <Box sx={{ mt: 1, textAlign: 'center' }}>
            <Typography variant="caption" color="text.secondary">
              {recentEvals.length > 2 ? `Last ${recentEvals.length} evaluations` : 'Last 2 evaluations'}
              {' — '}
              {(() => {
                const first = recentEvals[0].overall_score || recentEvals[0].findings?.overall_score || 0;
                const last = recentEvals[recentEvals.length - 1].overall_score || recentEvals[recentEvals.length - 1].findings?.overall_score || 0;
                const diff = Math.round(last - first);
                if (diff > 0) return <span style={{ color: '#66BB6A' }}>+{diff}% improvement</span>;
                if (diff < 0) return <span style={{ color: '#EF5350' }}>{diff}% decline</span>;
                return <span>No change</span>;
              })()}
            </Typography>
          </Box>
        )}
      </Paper>
    );
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
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3 }}>
        <Box>
          <Typography variant="h4" component="h1" sx={{ fontWeight: 'bold' }}>
            Evaluation History
          </Typography>
          <Typography variant="body1" color="text.secondary">
            Track your compliance score over time
          </Typography>
        </Box>
        <Button
          variant="outlined"
          startIcon={<Refresh />}
          onClick={fetchHistory}
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
        <Alert severity="info">
          Evaluation history requires the desktop application.
        </Alert>
      ) : evaluations.length === 0 ? (
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
        <>
          {/* Score Chart */}
          <ScoreChart />

          {/* Evaluation List */}
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
                  <Box sx={{ p: 3, '&:hover': { backgroundColor: 'action.hover' } }}>
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
                            color={getStatusColor(eval_.status || findings.status || '') as any}
                            variant="outlined"
                          />
                          {getTrendIcon(index)}
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
                          {findings.recommendations.filter((r: any) => r.priority === 'high').length} high priority
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
        </>
      )}
    </Container>
  );
};

export default EvaluationHistory;
