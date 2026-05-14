import React, { useEffect } from 'react';
import { Box, Card, CardContent, Skeleton, Typography } from '@mui/material';
import { motion, useSpring, useTransform, AnimatePresence } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import { ComplianceEvaluation } from '../services/api';

interface ScoreHeroProps {
  evaluation: ComplianceEvaluation | null;
  loading?: boolean;
  selectedFramework?: number;
}

const FRAMEWORKS = [
  { id: 1, label: 'SOC 2' },
  { id: 2, label: 'ISO 27001' },
  { id: 3, label: 'HIPAA' },
];

function getStatusLabel(score: number): string {
  if (score >= 90) return 'GOOD STANDING';
  if (score >= 70) return 'ON TRACK';
  return 'NEEDS ATTENTION';
}

function getStatusColors(score: number): { color: string; bg: string } {
  if (score >= 90) return { color: '#065F46', bg: '#D1FAE5' };
  if (score >= 70) return { color: '#92400E', bg: '#FEF3C7' };
  return { color: '#991B1B', bg: '#FEE2E2' };
}

const ScoreHero: React.FC<ScoreHeroProps> = ({
  evaluation,
  loading = false,
  selectedFramework = 1,
}) => {
  const navigate = useNavigate();
  const scoreSpring = useSpring(0, { stiffness: 60, damping: 15 });
  const displayScore = useTransform(scoreSpring, v => Math.round(v));

  useEffect(() => {
    scoreSpring.set(evaluation ? Math.round(evaluation.overall_score) : 0);
  }, [evaluation?.overall_score, scoreSpring]);

  if (loading) {
    return (
      <Card sx={{ height: '100%', minHeight: 280 }}>
        <CardContent sx={{ p: 3 }}>
          <Skeleton variant="rectangular" width={120} height={72} sx={{ borderRadius: 2, mb: 1.5 }} />
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
  const statusColors = getStatusColors(score);

  return (
    <Card sx={{ height: '100%', minHeight: 280 }}>
      <CardContent sx={{ p: 3 }}>
        <Box sx={{ mb: 1.5 }}>
          {evaluation ? (
            <Box sx={{ display: 'flex', alignItems: 'baseline', gap: 0.5 }}>
              <motion.span style={{ fontSize: '4rem', fontWeight: 800, lineHeight: 1, fontFamily: 'inherit' }}>
                <motion.span>{displayScore}</motion.span>
              </motion.span>
              <Typography sx={{ fontSize: '1.5rem', fontWeight: 500, color: 'text.secondary', lineHeight: 1 }}>
                %
              </Typography>
            </Box>
          ) : (
            <Typography sx={{ fontSize: '4rem', fontWeight: 800, lineHeight: 1, color: 'text.disabled' }}>
              --
            </Typography>
          )}
          <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
            {evaluation ? evaluation.framework_name : 'No evaluation yet'}
          </Typography>
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
              <Box
                sx={{
                  display: 'inline-flex', alignItems: 'center', gap: 0.5,
                  px: 1.5, py: 0.5, borderRadius: 20,
                  backgroundColor: statusColors.bg,
                  color: statusColors.color,
                  fontSize: '0.7rem', fontWeight: 700, letterSpacing: '0.5px',
                }}
              >
                <Box sx={{ width: 6, height: 6, borderRadius: '50%', backgroundColor: statusColors.color }} />
                {getStatusLabel(score)}
              </Box>
            </motion.div>
          )}
        </AnimatePresence>

        <Box sx={{ display: 'flex', gap: 1 }}>
          {evaluation && FRAMEWORKS.map(fw => {
            const isActive = fw.id === selectedFramework;
            const isCurrentEval = evaluation && evaluation.framework_id === fw.id;
            return (
              <Box
                key={fw.id}
                data-fw={fw.id}
                onClick={() => navigate(`/?fw=${fw.id}`)}
                sx={{
                  flex: 1, p: 1.5, borderRadius: 2, cursor: 'pointer',
                  border: '1px solid',
                  borderColor: isActive ? 'primary.main' : 'divider',
                  borderLeftWidth: isActive ? 3 : 1,
                  backgroundColor: isActive ? 'rgba(37,99,235,0.04)' : 'transparent',
                  transition: 'all 0.15s',
                  '&:hover': { backgroundColor: 'action.hover', transform: 'translateY(-1px)' },
                }}
              >
                <Typography sx={{ fontSize: '0.7rem', color: 'text.secondary', mb: 0.25 }}>
                  {fw.label}
                </Typography>
                <Typography sx={{ fontSize: '1rem', fontWeight: 700, color: isActive && isCurrentEval ? 'primary.main' : 'text.primary' }}>
                  {isActive && isCurrentEval ? `${score}%` : '--'}
                </Typography>
              </Box>
            );
          })}
        </Box>

        {evaluation && (
          <Box sx={{ mt: 2, pt: 1.5, borderTop: '1px solid', borderColor: 'divider' }}>
            <Typography variant="caption" color="text.secondary">
              {evaluation.compliant_controls}/{evaluation.total_controls} controls compliant ·{' '}
              Last evaluated {new Date(evaluation.evaluation_date).toLocaleDateString()}
            </Typography>
          </Box>
        )}
      </CardContent>
    </Card>
  );
};

export default ScoreHero;
