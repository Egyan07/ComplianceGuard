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
} from '@mui/material';
import { useTheme } from '@mui/material/styles';
import {
  Assessment,
  Refresh,
  CheckCircle,
  Warning,
  Error as ErrorIcon,
  HelpOutlined,
} from '@mui/icons-material';

import { useLicense } from '../contexts/LicenseContext';
import ScoreTrend from './ScoreTrend';
import PageHeader from './ui/PageHeader';
import EmptyState from './ui/EmptyState';
import { getScoreTrend, evaluationHistoryToTrend } from '../services/api';
import type { TrendPoint } from '../services/api';
import type { Recommendation } from '../services/api.types';
import { getElectronAPI, isElectronMode } from '../services/electron';
import { getErrorMessage } from '../lib/errors';
import { RADIUS, SCORE_BAND_LABEL, SCORE_BAND_TONE, scoreBand, Tone, toneColors } from '../theme';

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

// The canonical 0-100 readiness bands (theme.ts: ≥85 good / ≥70 on track /
// <70 attention) are the single display vocabulary — the stored engine status
// string (whose thresholds differ) never drives a row's tone or label.
const BAND_ICON = {
  good: CheckCircle,
  on_track: Warning,
  attention: ErrorIcon,
} as const;

const EvaluationHistory: React.FC<EvaluationHistoryProps> = ({ onNavigate }) => {
  const theme = useTheme();
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

  if (!isFeatureAllowed('evaluation_history')) {
    return (
      <Container maxWidth="lg" sx={{ mt: 4, mb: 4 }}>
        <PageHeader title="Evaluation History" />
        <Paper sx={{ borderRadius: RADIUS.lg }}>
          <EmptyState
            icon={<Assessment sx={{ fontSize: 42 }} />}
            title="Track your compliance over time"
            description="Evaluation history and score trends are available with a Pro license."
            action={
              <Button variant="contained" onClick={() => onNavigate?.('settings')}>
                Upgrade to Pro
              </Button>
            }
          />
        </Paper>
      </Container>
    );
  }

  return (
    <Container maxWidth="lg" sx={{ mt: 4, mb: 4 }}>
      <PageHeader
        title="Evaluation History"
        actions={
          <Button
            variant="outlined"
            startIcon={<Refresh />}
            onClick={() => fetchHistory(selectedFramework)}
            disabled={loading}
          >
            Refresh
          </Button>
        }
      />

      {error && (
        <Alert severity="error" sx={{ mb: 3 }}>{error}</Alert>
      )}

      {loading ? (
        <Box sx={{ display: 'flex', justifyContent: 'center', py: 8 }}>
          <CircularProgress size={50} />
        </Box>
      ) : (
        <>
          <ScoreTrend
            evaluations={trendPoints}
            loading={trendLoading}
            selectedFramework={selectedFramework}
            onFrameworkChange={(fw) => setSelectedFramework(fw)}
          />
          {!isElectron ? (
            <Alert severity="info" sx={{ mt: 1 }}>
              Evaluation history requires the desktop application.
            </Alert>
          ) : evaluations.length === 0 ? (
            <Paper sx={{ borderRadius: RADIUS.lg }}>
              <EmptyState
                icon={<Assessment sx={{ fontSize: 42 }} />}
                title="No evaluations yet"
                description={'Go to the Dashboard, collect evidence, and run "Evaluate Compliance" to see results here.'}
              />
            </Paper>
          ) : (
            <Paper sx={{ borderRadius: RADIUS.lg }}>
              <Box sx={{ p: 2.5, borderBottom: 1, borderColor: 'divider' }}>
                <Typography variant="h6" sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                  <Assessment color="primary" sx={{ fontSize: 20 }} />
                  All Evaluations ({evaluations.length})
                </Typography>
              </Box>

              {evaluations.map((eval_, index) => {
                const score = Math.round(eval_.overall_score || eval_.findings?.overall_score || 0);
                const findings = eval_.findings || {};
                const notAssessed = score === 0 && (eval_.status || findings.status) === 'not_assessed';
                const band = scoreBand(score);
                const tone: Tone = SCORE_BAND_TONE[band];
                // Chip takes a concrete MUI color; the canonical bands only
                // ever map to success/warning/error (never neutral).
                const chipColor = tone === 'error' ? 'error' : tone === 'warning' ? 'warning' : 'success';
                const tc = toneColors(theme, tone);
                const BandIcon = BAND_ICON[band];

                return (
                  <React.Fragment key={eval_.id || index}>
                    <Box
                      sx={{
                        p: 3,
                        borderLeft: '2px solid',
                        borderColor: 'divider',
                        pl: 2,
                        '&:hover': { backgroundColor: 'action.hover' },
                      }}
                    >
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                        {/* Status icon — canonical band, not the stored status string */}
                        {notAssessed
                          ? <HelpOutlined sx={{ color: 'text.disabled' }} />
                          : <BandIcon sx={{ color: tc.main }} />}

                        {/* Main content */}
                        <Box sx={{ flex: 1, minWidth: 0 }}>
                          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 0.5, flexWrap: 'wrap' }}>
                            <Typography sx={{ fontSize: '0.95rem', fontWeight: 650 }}>
                              {new Date(eval_.evaluation_date).toLocaleDateString('en-US', {
                                year: 'numeric', month: 'long', day: 'numeric',
                              })}
                            </Typography>
                            <Chip
                              label={notAssessed ? 'NOT ASSESSED' : SCORE_BAND_LABEL[band]}
                              size="small"
                              color={notAssessed ? 'default' : chipColor}
                              variant="outlined"
                              sx={{ fontSize: '0.7rem', fontWeight: 600 }}
                            />
                          </Box>

                          {/* Control breakdown */}
                          <Box sx={{ display: 'flex', gap: 3, mt: 1, flexWrap: 'wrap' }}>
                            <Typography variant="body2" color="text.secondary">
                              Controls: <strong>{findings.total_controls || 0}</strong>
                            </Typography>
                            <Typography variant="body2" sx={{ color: toneColors(theme, 'success').onSurface }}>
                              Compliant: <strong>{findings.compliant_controls || 0}</strong>
                            </Typography>
                            <Typography variant="body2" sx={{ color: toneColors(theme, 'warning').onSurface }}>
                              Partial: <strong>{findings.partial_controls || 0}</strong>
                            </Typography>
                            <Typography variant="body2" sx={{ color: toneColors(theme, 'error').onSurface }}>
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
                                '& .MuiLinearProgress-bar': { backgroundColor: tc.main },
                              }}
                            />
                          </Box>
                        </Box>

                        {/* Score */}
                        <Box sx={{ textAlign: 'center', minWidth: 84, flexShrink: 0 }}>
                          <Typography
                            sx={{
                              fontSize: '1.9rem',
                              fontWeight: 750,
                              color: tc.main,
                              lineHeight: 1.1,
                              letterSpacing: '-1px',
                              fontVariantNumeric: 'tabular-nums',
                            }}
                          >
                            {score}%
                          </Typography>
                          <Typography sx={{ fontSize: '0.72rem', color: 'text.secondary', mt: 0.25 }}>
                            score
                          </Typography>
                        </Box>
                      </Box>

                      {/* Recommendations count */}
                      {findings.recommendations && findings.recommendations.length > 0 && (
                        <Box sx={{ mt: 1.5, ml: 5 }}>
                          <Typography sx={{ fontSize: '0.75rem', color: 'text.secondary' }}>
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
