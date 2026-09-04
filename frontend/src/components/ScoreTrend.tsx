import React, { useMemo } from 'react';
import { Box, Paper, Typography, Skeleton } from '@mui/material';
import { useTheme } from '@mui/material/styles';
import { motion } from 'framer-motion';
import type { TrendPoint, TrendDisplayPoint } from '../services/api';
import EmptyState from './ui/EmptyState';
import Segmented from './ui/Segmented';
import { RADIUS, SCORE_BAND_GOOD, SCORE_BAND_ON_TRACK, SCORE_BAND_LABEL, scoreBand } from '../theme';

// ── Constants ──────────────────────────────────────────────────────────────

const FRAMEWORKS: { id: 1 | 2 | 3 | 4; label: string }[] = [
  { id: 1, label: 'SOC 2' },
  { id: 2, label: 'ISO 27001' },
  { id: 3, label: 'HIPAA' },
  { id: 4, label: 'GDPR' },
];

const W = 820, H = 120, PAD = 40;

// ── Helpers ────────────────────────────────────────────────────────────────

function statusLabel(score: number): string {
  const band = scoreBand(score);
  if (band === 'good') return 'Good Standing';
  if (band === 'on_track') return 'On Track';
  return 'Needs Attention';
}

// CG-M2: an evaluation with nothing assessed is "Not Assessed", not a failed
// (Needs Attention) assessment — even though its numeric average is 0.
function pointLabel(p: TrendPoint): string {
  if (p.status === 'not_assessed') return 'Not Assessed';
  return statusLabel(p.score);
}

function fmtDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function toDisplayPoints(pts: TrendPoint[]): TrendDisplayPoint[] {
  return pts.map((p, i) => ({
    ...p,
    formattedDate: fmtDate(p.date),
    // The canonical 0-100 readiness bands (≥85 good / ≥70 on track / <70
    // attention) are the display vocabulary — labels never depend on the
    // engine's stored status string (whose thresholds differ). The single
    // exception (CG-M2): a not_assessed evaluation is labelled as such.
    statusLabel: pointLabel(p),
    delta: i === 0 ? undefined : p.score - pts[i - 1].score,
  }));
}

// ── Monotone cubic Bézier (Fritsch-Carlson) ────────────────────────────────
// Guarantees curve never overshoots — never implies scores that didn't exist.

interface Pt { x: number; y: number; }

function monotonePath(pts: Pt[]): { line: string; fill: string } {
  if (pts.length === 0) return { line: '', fill: '' };
  if (pts.length === 1) return { line: `M${pts[0].x},${pts[0].y}`, fill: '' };

  const n = pts.length;
  const d: number[] = [];
  for (let i = 0; i < n - 1; i++) {
    d[i] = (pts[i + 1].y - pts[i].y) / (pts[i + 1].x - pts[i].x);
  }
  const m: number[] = new Array(n).fill(0);
  m[0] = d[0];
  m[n - 1] = d[n - 2];
  for (let i = 1; i < n - 1; i++) m[i] = (d[i - 1] + d[i]) / 2;
  for (let i = 0; i < n - 1; i++) {
    if (Math.abs(d[i]) < 1e-10) { m[i] = m[i + 1] = 0; continue; }
    const a = m[i] / d[i], b = m[i + 1] / d[i];
    const h = Math.hypot(a, b);
    if (h > 3) { m[i] = 3 * a / h * Math.abs(d[i]); m[i + 1] = 3 * b / h * Math.abs(d[i]); }
  }
  let line = `M${pts[0].x},${pts[0].y}`;
  for (let i = 0; i < n - 1; i++) {
    const dx = pts[i + 1].x - pts[i].x;
    const cp1x = pts[i].x + dx / 3;
    const cp1y = pts[i].y + (m[i] * dx) / 3;
    const cp2x = pts[i + 1].x - dx / 3;
    const cp2y = pts[i + 1].y - (m[i + 1] * dx) / 3;
    line += ` C${cp1x},${cp1y} ${cp2x},${cp2y} ${pts[i + 1].x},${pts[i + 1].y}`;
  }
  const last = pts[n - 1];
  const fill = `${line} L${last.x},${H} L${pts[0].x},${H} Z`;
  return { line, fill };
}

// ── Chart geometry (memoized) ──────────────────────────────────────────────

interface ChartGeometry { svgPoints: Pt[]; linePath: string; fillPath: string; }

function buildGeometry(pts: TrendDisplayPoint[]): ChartGeometry {
  if (pts.length === 0) return { svgPoints: [], linePath: '', fillPath: '' };
  const xStep = pts.length === 1 ? 0 : (W - PAD * 2) / (pts.length - 1);
  const svgPoints = pts.map((p, i) => ({ x: PAD + i * xStep, y: (1 - p.score / 100) * H }));
  const { line, fill } = monotonePath(svgPoints);
  return { svgPoints, linePath: line, fillPath: fill };
}

// ── Theme-derived chart palette (single source: the active theme) ──────────

interface ChartPalette {
  ink: string;        // primary line / numerals
  soft: string;       // secondary text
  grid: string;       // grid lines
  track: string;      // subtle bars/tracks
  good: string;       // success
  warn: string;       // warning
  bad: string;        // error
}

const ScoreHero: React.FC<{ pts: TrendDisplayPoint[]; pal: ChartPalette }> = ({ pts, pal }) => {
  const latest = pts[pts.length - 1];
  const delta = pts.length >= 2 ? pts[pts.length - 1].score - pts[0].score : undefined;
  // N-1 (CG-M2 consistency): an all-not-assessed evaluation scores 0 but its
  // semantic status is 'not_assessed', not a failure. The mini-hero must show
  // the same neutral "Not Assessed" state as ScoreHero and the table — never
  // the red "Needs Attention" its zero score would imply via the score band.
  const latestNotAssessed = !!latest && latest.status === 'not_assessed';
  const band = latest ? scoreBand(latest.score) : 'attention';
  const dotColor = latestNotAssessed
    ? pal.soft
    : band === 'good'
      ? pal.good
      : band === 'on_track'
        ? pal.warn
        : pal.bad;
  const latestLabel = latest
    ? latestNotAssessed
      ? 'Not Assessed'
      : SCORE_BAND_LABEL[scoreBand(latest.score)]
    : '';

  return (
    <Box sx={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', mb: '28px', flexWrap: 'wrap', gap: 2 }}>
      <Box>
        <Typography sx={{ fontSize: '0.8125rem', fontWeight: 500, color: 'text.secondary', mb: '4px' }}>
          Current compliance score
        </Typography>
        <Box sx={{ display: 'flex', alignItems: 'baseline', gap: '4px' }}>
          <Typography
            sx={{
              fontSize: '4.5rem',
              fontWeight: 800,
              letterSpacing: '-3.5px',
              lineHeight: 1,
              color: 'text.primary',
              fontVariantNumeric: 'tabular-nums',
            }}
          >
            {latest?.score ?? 0}
          </Typography>
          <Typography sx={{ fontSize: '1.75rem', fontWeight: 600, letterSpacing: '-0.5px', color: 'text.secondary' }}>%</Typography>
        </Box>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: '6px', mt: '8px' }}>
          <Box sx={{ width: 7, height: 7, borderRadius: '50%', bgcolor: dotColor }} data-state={latestNotAssessed ? 'not_assessed' : band} />
          <Typography sx={{ fontSize: '0.8125rem', fontWeight: 500, color: 'text.secondary' }}>
            {latestLabel}
          </Typography>
        </Box>
      </Box>
      {delta !== undefined && (
        <Box sx={{ display: 'flex', gap: '32px', alignItems: 'flex-end', pb: '8px' }}>
          <Box sx={{ textAlign: 'right' }}>
            <Typography
              sx={{
                fontSize: '0.875rem',
                fontWeight: 600,
                letterSpacing: '-0.2px',
                color: delta >= 0 ? 'success.dark' : 'error.dark',
                fontVariantNumeric: 'tabular-nums',
              }}
            >
              {delta >= 0 ? '↑' : '↓'} {delta >= 0 ? '+' : ''}{delta} pts
            </Typography>
            <Typography sx={{ fontSize: '0.75rem', color: 'text.secondary', mt: '1px' }}>
              since {pts[0] ? fmtDate(pts[0].date) : ''}
            </Typography>
          </Box>
          <Box sx={{ textAlign: 'right' }}>
            <Typography
              sx={{
                fontSize: '1.9rem',
                fontWeight: 700,
                letterSpacing: '-1.5px',
                lineHeight: 1,
                color: 'text.primary',
                fontVariantNumeric: 'tabular-nums',
              }}
            >
              {pts.length}
            </Typography>
            <Typography sx={{ fontSize: '0.75rem', color: 'text.secondary', mt: '1px' }}>evaluations</Typography>
          </Box>
        </Box>
      )}
    </Box>
  );
};

const TrendChart: React.FC<{ pts: TrendDisplayPoint[]; geo: ChartGeometry; pal: ChartPalette }> = ({ pts, geo, pal }) => {
  // Zone gridlines derive from the canonical score scale (theme.ts) so the
  // trend zones and the hero band can never disagree about what score is good.
  const goodY = (1 - SCORE_BAND_GOOD / 100) * H;   // top of the good zone
  const onTrackY = (1 - SCORE_BAND_ON_TRACK / 100) * H; // top of the on-track zone
  return (
  <Box>
    <svg
      role="img"
      aria-label="Compliance score trend over time"
      viewBox={`0 0 ${W} ${H}`}
      preserveAspectRatio="none"
      style={{ width: '100%', height: '140px', display: 'block', overflow: 'visible' }}
    >
      <defs>
        <linearGradient id="trendFill" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={pal.ink} stopOpacity="0.06" />
          <stop offset="100%" stopColor={pal.ink} stopOpacity="0" />
        </linearGradient>
      </defs>
      <line x1="0" y1="0" x2={W} y2="0" stroke={pal.grid} strokeWidth="0.8" />
      <line x1="0" y1={goodY} x2={W} y2={goodY} stroke={pal.grid} strokeWidth="0.8" strokeDasharray="3 4" />
      <line x1="0" y1={onTrackY} x2={W} y2={onTrackY} stroke={pal.grid} strokeWidth="0.8" strokeDasharray="3 4" />
      <line x1="0" y1={H} x2={W} y2={H} stroke={pal.grid} strokeWidth="0.8" />
      <text x="4" y={goodY - 4} fontSize="11" fill={pal.good} fontFamily="Inter" fontWeight="600" letterSpacing="0.02em" aria-hidden="true">≥{SCORE_BAND_GOOD}%</text>
      <text x="4" y={onTrackY - 4} fontSize="11" fill={pal.warn} fontFamily="Inter" fontWeight="600" letterSpacing="0.02em" aria-hidden="true">≥{SCORE_BAND_ON_TRACK}%</text>
      <text x="4" y={H - 4} fontSize="11" fill={pal.bad} fontFamily="Inter" fontWeight="600" letterSpacing="0.02em" aria-hidden="true">&lt;{SCORE_BAND_ON_TRACK}%</text>
      {geo.fillPath && <path d={geo.fillPath} fill="url(#trendFill)" />}
      {geo.linePath && (
        <motion.path
          d={geo.linePath} fill="none" stroke={pal.ink} strokeWidth="1.5" strokeLinecap="round"
          initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.35, ease: 'easeOut' }}
        />
      )}
      {geo.svgPoints.map((pt, i) => {
        const isLatest = i === geo.svgPoints.length - 1;
        return isLatest ? (
          <circle key={i} cx={pt.x} cy={pt.y} r="5" fill={pal.ink}
            aria-label={`${pts[i].formattedDate} score ${pts[i].score} percent`} />
        ) : (
          <circle key={i} cx={pt.x} cy={pt.y} r="3.5" fill="#ffffff" stroke={pal.ink} strokeWidth="1.5"
            aria-label={`${pts[i].formattedDate} score ${pts[i].score} percent`} />
        );
      })}
      {geo.svgPoints.length > 0 && (() => {
        const lp = geo.svgPoints[geo.svgPoints.length - 1];
        const latest = pts[pts.length - 1];
        const pillarY = Math.max(22, lp.y);
        return (
          <g>
            <rect x={lp.x - 38} y={pillarY - 22} width="76" height="18" rx="9" ry="9" fill={pal.ink} />
            <text x={lp.x} y={pillarY - 10} fontSize="11" fill="#ffffff" fontFamily="Inter" fontWeight="600" textAnchor="middle" style={{ letterSpacing: '-0.3px' }}>
              {latest?.score}% · now
            </text>
          </g>
        );
      })()}
    </svg>
    <Box sx={{ display: 'flex', justifyContent: 'space-between', mt: '6px', px: `${PAD}px` }}>
      {pts.map((p, i) => (
        <Typography
          key={i}
          sx={{
            fontSize: '0.75rem',
            fontWeight: i === pts.length - 1 ? 600 : 400,
            color: i === pts.length - 1 ? 'text.primary' : 'text.secondary',
          }}
        >
          {p.formattedDate}
        </Typography>
      ))}
    </Box>
  </Box>
  );
};

const STATUS_FILL: Record<ReturnType<typeof scoreBand>, (pal: ChartPalette) => string> = {
  good: pal => pal.good,
  on_track: pal => pal.warn,
  attention: pal => pal.bad,
};

const EvaluationTable: React.FC<{ pts: TrendDisplayPoint[]; pal: ChartPalette }> = ({ pts, pal }) => (
  <Box sx={{ mt: '28px', pt: '20px', borderTop: '1px solid', borderColor: 'divider' }}>
    <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: '12px' }}>
      <Typography sx={{ fontSize: '1.125rem', fontWeight: 650, letterSpacing: '-0.3px', color: 'text.primary' }}>
        All Evaluations
      </Typography>
      <Typography sx={{ fontSize: '0.8125rem', color: 'text.secondary' }}>{pts.length} total</Typography>
    </Box>
    {[...pts].reverse().map((p, i) => (
      <Box
        key={i}
        sx={{
          display: 'flex',
          alignItems: 'center',
          gap: '16px',
          py: '10px',
          borderBottom: i < pts.length - 1 ? '1px solid' : 'none',
          borderColor: 'divider',
        }}
      >
        <Typography
          sx={{
            fontSize: '0.8125rem',
            color: 'text.secondary',
            width: '92px',
            flexShrink: 0,
            fontVariantNumeric: 'tabular-nums',
          }}
        >
          {p.formattedDate}
        </Typography>
        <Box sx={{ flex: 1, background: pal.track, borderRadius: '999px', height: '4px', overflow: 'hidden' }}>
          <Box sx={{ height: '100%', borderRadius: '999px', width: `${p.score}%`, bgcolor: STATUS_FILL[scoreBand(p.score)](pal) }} />
        </Box>
        <Typography
          sx={{
            fontSize: '0.875rem',
            fontWeight: 600,
            letterSpacing: '-0.2px',
            width: '44px',
            textAlign: 'right',
            flexShrink: 0,
            fontVariantNumeric: 'tabular-nums',
            color: 'text.primary',
          }}
        >
          {p.score}%
        </Typography>
        <Typography
          sx={{
            fontSize: '0.75rem',
            fontWeight: 600,
            width: '38px',
            textAlign: 'right',
            flexShrink: 0,
            fontVariantNumeric: 'tabular-nums',
            color: p.delta === undefined ? 'text.secondary'
              : p.delta > 0 ? 'success.dark'
                : p.delta < 0 ? 'error.dark' : 'text.secondary',
          }}
        >
          {p.delta === undefined ? '—' : p.delta > 0 ? `+${p.delta}` : p.delta === 0 ? '—' : `${p.delta}`}
        </Typography>
        <Typography
          sx={{
            fontSize: '0.75rem',
            fontWeight: 500,
            color: 'text.secondary',
            width: '118px',
            textAlign: 'right',
            flexShrink: 0,
          }}
        >
          {p.statusLabel}
        </Typography>
      </Box>
    ))}
  </Box>
);

// ── Public component ────────────────────────────────────────────────────────

export interface ScoreTrendProps {
  evaluations: TrendPoint[];
  loading?: boolean;
  selectedFramework: 1 | 2 | 3 | 4;
  onFrameworkChange: (fw: 1 | 2 | 3 | 4) => void;
}

const ScoreTrend: React.FC<ScoreTrendProps> = ({ evaluations, loading = false, selectedFramework, onFrameworkChange }) => {
  const theme = useTheme();
  const displayPoints = useMemo(() => toDisplayPoints(evaluations), [evaluations]);
  const chartGeometry = useMemo(() => buildGeometry(displayPoints), [displayPoints]);

  const light = theme.palette.mode === 'light';
  const pal: ChartPalette = {
    ink: theme.palette.text.primary,
    soft: theme.palette.text.secondary,
    grid: theme.palette.divider,
    track: light ? '#EEF2F7' : 'rgba(255,255,255,0.08)',
    good: theme.palette.success.main,
    warn: theme.palette.warning.main,
    bad: theme.palette.error.main,
  };

  return (
    <Paper
      sx={{
        borderRadius: RADIUS.lg,
        p: 3,
        mb: 1.5,
        boxShadow: 'none',
        border: '1px solid',
        borderColor: 'divider',
      }}
    >
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3, flexWrap: 'wrap', gap: 1.5 }}>
        <Typography sx={{ fontSize: '1.25rem', fontWeight: 700, letterSpacing: '-0.4px', color: 'text.primary' }}>
          Compliance History
        </Typography>
        <Segmented
          options={FRAMEWORKS.map(f => ({ value: f.id, label: f.label }))}
          value={selectedFramework}
          onChange={(fw) => onFrameworkChange(fw as 1 | 2 | 3 | 4)}
        />
      </Box>
      {loading ? (
        <Box>
          <Skeleton variant="rectangular" height={80} sx={{ borderRadius: '12px', mb: 2 }} />
          <Skeleton variant="rectangular" height={140} sx={{ borderRadius: '12px', mb: 2 }} />
          <Skeleton variant="rectangular" height={200} sx={{ borderRadius: '12px' }} />
        </Box>
      ) : evaluations.length === 0 ? (
        <EmptyState
          dashed
          title="No evaluations for this framework yet"
          description="Run your first evaluation to begin tracking compliance progression over time."
        />
      ) : (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.35, ease: 'easeOut' }}>
          <ScoreHero pts={displayPoints} pal={pal} />
          <TrendChart pts={displayPoints} geo={chartGeometry} pal={pal} />
          <EvaluationTable pts={displayPoints} pal={pal} />
        </motion.div>
      )}
    </Paper>
  );
};

export default ScoreTrend;
