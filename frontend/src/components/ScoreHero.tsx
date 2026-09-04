import React, { useEffect } from 'react';
import { Box, Card, CardContent, Skeleton, Typography } from '@mui/material';
import { alpha, useTheme } from '@mui/material/styles';
import { motion, useSpring, useTransform, AnimatePresence } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import { ComplianceEvaluation } from '../services/api';
import StatusChip from './ui/StatusChip';
import { RADIUS, scoreBand, SCORE_BAND_LABEL, SCORE_BAND_TONE, toneColors } from '../theme';

interface ScoreHeroProps {
  evaluation: ComplianceEvaluation | null;
  loading?: boolean;
  selectedFramework?: number;
}

const FRAMEWORKS = [
  { id: 1, label: 'SOC 2' },
  { id: 2, label: 'ISO 27001' },
  { id: 3, label: 'HIPAA' },
  { id: 4, label: 'GDPR' },
];

const ScoreHero: React.FC<ScoreHeroProps> = ({
  evaluation,
  loading = false,
  selectedFramework = 1,
}) => {
  const theme = useTheme();
  const navigate = useNavigate();
  const scoreSpring = useSpring(0, { stiffness: 60, damping: 15 });
  const displayScore = useTransform(scoreSpring, v => Math.round(v));

  useEffect(() => {
    scoreSpring.set(evaluation ? Math.round(evaluation.overall_score) : 0);
  }, [evaluation, scoreSpring]);

  if (loading) {
    return (
      <Card sx={{ height: '100%', minHeight: 280 }}>
        <CardContent sx={{ p: 3 }}>
          <Skeleton variant="rectangular" width={120} height={80} sx={{ borderRadius: RADIUS.md, mb: 1.5 }} />
          <Skeleton variant="rounded" width={140} height={28} sx={{ mb: 3 }} />
          <Box sx={{ display: 'flex', gap: 1 }}>
            {[0, 1, 2].map(i => (
              <Skeleton key={i} variant="rounded" sx={{ flex: 1, height: 64 }} />
            ))}
          </Box>
        </CardContent>
      </Card>
    );
  }

  const score = evaluation ? Math.round(evaluation.overall_score) : 0;
  // One readiness scale across the app: bands mirror the trend-chart zones.
  const band = scoreBand(score);
  // CG-M2: an evaluation with nothing assessed is "Not Assessed", not a
  // failed assessment — do not present a 0-score all-not-assessed evaluation
  // as red "Needs Attention".
  const notAssessed = !!evaluation && evaluation.status === 'not_assessed';
  const statusLabel = notAssessed ? 'Not Assessed' : SCORE_BAND_LABEL[band];
  const tone = notAssessed ? 'neutral' : SCORE_BAND_TONE[band];
  const tc = toneColors(theme, tone);

  return (
    <Card sx={{ height: '100%', minHeight: 280, borderTop: '3px solid', borderTopColor: 'primary.main' }}>
      <CardContent sx={{ p: 3 }}>
        <Box sx={{ mb: 1.5 }}>
          {evaluation ? (
            <Box sx={{ display: 'flex', alignItems: 'baseline', gap: 0.5 }}>
              <motion.span
                animate={{ color: tc.main }}
                transition={{ duration: 0.6, ease: 'easeOut' }}
                style={{
                  fontSize: '5rem',
                  fontWeight: 800,
                  lineHeight: 1,
                  letterSpacing: '-3px',
                  fontVariantNumeric: 'tabular-nums',
                  fontFamily: 'inherit',
                }}
              >
                <motion.span>{displayScore}</motion.span>
              </motion.span>
              <Typography sx={{ fontSize: '1.5rem', fontWeight: 500, color: 'text.secondary', lineHeight: 1 }}>
                %
              </Typography>
            </Box>
          ) : (
            <Box
              sx={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                py: 4,
                gap: 1.5,
                border: '1.5px dashed',
                borderColor: 'divider',
                borderRadius: '12px',
              }}
            >
              <Typography sx={{ color: 'text.secondary', fontSize: '0.875rem', textAlign: 'center' }}>
                No evaluation yet.<br />Run an evaluation to see your compliance score.
              </Typography>
            </Box>
          )}
          {evaluation && (
            <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
              {evaluation.framework_name}
            </Typography>
          )}
        </Box>

        <AnimatePresence>
          {evaluation && (
            <motion.div
              initial={{ scale: 0.8, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.8, opacity: 0 }}
              transition={{ type: 'spring', stiffness: 200, damping: 20 }}
              style={{ display: 'inline-block', marginBottom: 20 }}
            >
              <StatusChip tone={tone} label={statusLabel} dot pill size="md" />
            </motion.div>
          )}
        </AnimatePresence>

        {evaluation && (
          <Box sx={{ display: 'flex', gap: 1 }}>
            {FRAMEWORKS.map(fw => {
              const isActive = fw.id === selectedFramework;
              const isCurrentEval = evaluation.framework_id === fw.id;
              return (
                <Box
                  key={fw.id}
                  data-fw={fw.id}
                  onClick={() => navigate(`/?fw=${fw.id}`)}
                  sx={{
                    flex: 1,
                    p: 1.5,
                    borderRadius: '8px',
                    cursor: 'pointer',
                    border: '1px solid',
                    borderColor: isActive ? 'primary.main' : 'divider',
                    borderLeft: '3px solid',
                    borderLeftColor: isActive ? 'primary.main' : 'transparent',
                    backgroundColor: isActive ? alpha(theme.palette.primary.main, 0.05) : 'transparent',
                    transition: 'all 0.15s',
                    '&:hover': { backgroundColor: 'action.hover', transform: 'translateY(-1px)' },
                  }}
                >
                  <Typography sx={{ fontSize: '0.75rem', color: 'text.secondary', mb: 0.25 }}>
                    {fw.label}
                  </Typography>
                  <Typography
                    sx={{
                      fontSize: '1.05rem',
                      fontWeight: 700,
                      fontVariantNumeric: 'tabular-nums',
                      color: isActive && isCurrentEval ? 'primary.main' : 'text.primary',
                    }}
                  >
                    {isActive && isCurrentEval ? `${score}%` : '--'}
                  </Typography>
                </Box>
              );
            })}
          </Box>
        )}

        {evaluation && (
          <Box sx={{ mt: 2, pt: 1.5, borderTop: '1px solid', borderColor: 'divider' }}>
            <Typography sx={{ fontSize: '0.75rem', color: 'text.secondary', lineHeight: 1.6 }}>
              {evaluation.compliant_controls}/{evaluation.total_controls} controls compliant
              {typeof evaluation.not_assessed_controls === 'number' && evaluation.not_assessed_controls > 0 && (
                <> · {evaluation.not_assessed_controls} not yet assessed</>
              )}{' '}
              · Last evaluated {new Date(evaluation.evaluation_date).toLocaleDateString()}
            </Typography>
            <Typography sx={{ display: 'block', fontSize: '0.75rem', color: 'text.secondary', mt: 0.5, opacity: 0.85 }}>
              Score = share of required control evidence demonstrated; unassessed controls lower it until evidence is collected.
            </Typography>
          </Box>
        )}
      </CardContent>
    </Card>
  );
};

export default ScoreHero;
