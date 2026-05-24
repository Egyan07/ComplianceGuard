import React, { useMemo } from 'react';
import { Box, Paper, Typography, Skeleton } from '@mui/material';
import { motion } from 'framer-motion';
import type { TrendPoint, TrendDisplayPoint } from '../services/api';

// ── Constants ──────────────────────────────────────────────────────────────

const FRAMEWORKS: { id: 1 | 2 | 3; label: string }[] = [
  { id: 1, label: 'SOC 2' },
  { id: 2, label: 'ISO 27001' },
  { id: 3, label: 'HIPAA' },
];

const W = 820, H = 120, PAD = 40;

// ── Helpers ────────────────────────────────────────────────────────────────

function statusLabel(s: TrendPoint['status']): string {
  if (s === 'compliant') return 'Good Standing';
  if (s === 'partial')   return 'On Track';
  return 'Needs Attention';
}

function fmtDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function toDisplayPoints(pts: TrendPoint[]): TrendDisplayPoint[] {
  return pts.map((p, i) => ({
    ...p,
    formattedDate: fmtDate(p.date),
    statusLabel: statusLabel(p.status),
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

// ── Sub-components ──────────────────────────────────────────────────────────

const FrameworkTabs: React.FC<{ selected: 1|2|3; onChange: (fw: 1|2|3) => void }> = ({ selected, onChange }) => (
  <Box sx={{ display: 'flex', gap: '4px' }}>
    {FRAMEWORKS.map(fw => (
      <Box
        key={fw.id}
        component="button"
        type="button"
        aria-pressed={selected === fw.id}
        onClick={() => onChange(fw.id)}
        sx={{
          font: 'inherit', cursor: 'pointer', outline: 'none',
          fontSize: '13px', fontWeight: selected === fw.id ? 600 : 500, letterSpacing: '-0.1px',
          padding: '6px 14px', borderRadius: '999px', border: '1px solid',
          borderColor: selected === fw.id ? '#1d1d1f' : 'transparent',
          bgcolor: selected === fw.id ? '#1d1d1f' : 'transparent',
          color: selected === fw.id ? '#ffffff' : '#707070',
          transition: 'all 0.1s',
          '&:hover': { color: '#1d1d1f' },
          '&:focus-visible': { outline: '2px solid #1d1d1f', outlineOffset: 2 },
        }}
      >
        {fw.label}
      </Box>
    ))}
  </Box>
);

const ScoreHero: React.FC<{ pts: TrendDisplayPoint[] }> = ({ pts }) => {
  const latest = pts[pts.length - 1];
  const delta = pts.length >= 2 ? pts[pts.length - 1].score - pts[0].score : undefined;
  const dotColor = latest?.status === 'compliant' ? '#34c759' : latest?.status === 'partial' ? '#ff9f0a' : '#b64400';

  return (
    <Box sx={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', mb: '28px' }}>
      <Box>
        <Typography sx={{ fontSize: '13px', fontWeight: 500, letterSpacing: '-0.1px', color: '#707070', mb: '4px' }}>
          Current compliance score
        </Typography>
        <Box sx={{ display: 'flex', alignItems: 'baseline', gap: '4px' }}>
          <Typography sx={{ fontSize: '80px', fontWeight: 800, letterSpacing: '-4px', lineHeight: 1, color: '#1d1d1f', fontVariantNumeric: 'tabular-nums' }}>
            {latest?.score ?? 0}
          </Typography>
          <Typography sx={{ fontSize: '28px', fontWeight: 600, letterSpacing: '-1px', color: '#707070' }}>%</Typography>
        </Box>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: '6px', mt: '8px' }}>
          <Box sx={{ width: 7, height: 7, borderRadius: '50%', bgcolor: dotColor }} />
          <Typography sx={{ fontSize: '13px', fontWeight: 500, letterSpacing: '-0.1px', color: '#707070' }}>
            {latest ? (latest.status === 'compliant' ? 'Compliant' : latest.status === 'partial' ? 'Partial' : 'Non-compliant') : ''}
          </Typography>
        </Box>
      </Box>
      {delta !== undefined && (
        <Box sx={{ display: 'flex', gap: '32px', alignItems: 'flex-end', pb: '8px' }}>
          <Box sx={{ textAlign: 'right' }}>
            <Typography sx={{ fontSize: '14px', fontWeight: 600, letterSpacing: '-0.2px', color: delta >= 0 ? '#34c759' : '#b64400', fontVariantNumeric: 'tabular-nums' }}>
              {delta >= 0 ? '↑' : '↓'} {delta >= 0 ? '+' : ''}{delta} pts
            </Typography>
            <Typography sx={{ fontSize: '12px', color: '#707070', letterSpacing: '-0.1px', mt: '1px' }}>
              since {pts[0] ? fmtDate(pts[0].date) : ''}
            </Typography>
          </Box>
          <Box sx={{ textAlign: 'right' }}>
            <Typography sx={{ fontSize: '32px', fontWeight: 700, letterSpacing: '-1.5px', lineHeight: 1, color: '#1d1d1f', fontVariantNumeric: 'tabular-nums' }}>
              {pts.length}
            </Typography>
            <Typography sx={{ fontSize: '12px', color: '#707070', letterSpacing: '-0.1px', mt: '1px' }}>evaluations</Typography>
          </Box>
        </Box>
      )}
    </Box>
  );
};

const TrendChart: React.FC<{ pts: TrendDisplayPoint[]; geo: ChartGeometry }> = ({ pts, geo }) => (
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
          <stop offset="0%" stopColor="#1d1d1f" stopOpacity="0.06" />
          <stop offset="100%" stopColor="#1d1d1f" stopOpacity="0" />
        </linearGradient>
      </defs>
      <line x1="0" y1="0" x2={W} y2="0" stroke="#e8e8ed" strokeWidth="0.8" />
      <line x1="0" y1="18" x2={W} y2="18" stroke="#e8e8ed" strokeWidth="0.8" strokeDasharray="3 4" />
      <line x1="0" y1="36" x2={W} y2="36" stroke="#e8e8ed" strokeWidth="0.8" strokeDasharray="3 4" />
      <line x1="0" y1={H} x2={W} y2={H} stroke="#e8e8ed" strokeWidth="0.8" />
      <text x="4" y="14" fontSize="10" fill="#34c759" fontFamily="Inter" fontWeight="600" letterSpacing="0.02em" aria-hidden="true">≥85%</text>
      <text x="4" y="32" fontSize="10" fill="#ff9f0a" fontFamily="Inter" fontWeight="600" letterSpacing="0.02em" aria-hidden="true">≥70%</text>
      <text x="4" y={H - 4} fontSize="10" fill="#b64400" fontFamily="Inter" fontWeight="600" letterSpacing="0.02em" aria-hidden="true">&lt;70%</text>
      {geo.fillPath && <path d={geo.fillPath} fill="url(#trendFill)" />}
      {geo.linePath && (
        <motion.path
          d={geo.linePath} fill="none" stroke="#1d1d1f" strokeWidth="1.5" strokeLinecap="round"
          initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.35, ease: 'easeOut' }}
        />
      )}
      {geo.svgPoints.map((pt, i) => {
        const isLatest = i === geo.svgPoints.length - 1;
        return isLatest ? (
          <circle key={i} cx={pt.x} cy={pt.y} r="5" fill="#1d1d1f"
            aria-label={`${pts[i].formattedDate} score ${pts[i].score} percent`} />
        ) : (
          <circle key={i} cx={pt.x} cy={pt.y} r="3.5" fill="#ffffff" stroke="#1d1d1f" strokeWidth="1.5"
            aria-label={`${pts[i].formattedDate} score ${pts[i].score} percent`} />
        );
      })}
      {geo.svgPoints.length > 0 && (() => {
        const lp = geo.svgPoints[geo.svgPoints.length - 1];
        const latest = pts[pts.length - 1];
        return (
          <g>
            <rect x={lp.x - 38} y={lp.y - 22} width="76" height="18" rx="9" ry="9" fill="#1d1d1f" />
            <text x={lp.x} y={lp.y - 10} fontSize="10" fill="#ffffff" fontFamily="Inter" fontWeight="600" textAnchor="middle" style={{ letterSpacing: '-0.3px' }}>
              {latest?.score}% · now
            </text>
          </g>
        );
      })()}
    </svg>
    <Box sx={{ display: 'flex', justifyContent: 'space-between', mt: '6px', px: `${PAD}px` }}>
      {pts.map((p, i) => (
        <Typography key={i} sx={{ fontSize: '11px', letterSpacing: '-0.1px', fontWeight: i === pts.length - 1 ? 600 : 400, color: i === pts.length - 1 ? '#1d1d1f' : '#707070' }}>
          {p.formattedDate}
        </Typography>
      ))}
    </Box>
  </Box>
);

const STATUS_FILL: Record<TrendPoint['status'], string> = {
  compliant: '#34c759',
  partial: '#ff9f0a',
  non_compliant: '#b64400',
};

const EvaluationTable: React.FC<{ pts: TrendDisplayPoint[] }> = ({ pts }) => (
  <Box sx={{ mt: '28px', pt: '20px', borderTop: '1px solid #e8e8ed' }}>
    <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: '12px' }}>
      <Typography sx={{ fontSize: '17px', fontWeight: 600, letterSpacing: '-0.3px', color: '#1d1d1f' }}>All Evaluations</Typography>
      <Typography sx={{ fontSize: '13px', color: '#707070', letterSpacing: '-0.1px' }}>{pts.length} total</Typography>
    </Box>
    {[...pts].reverse().map((p, i) => (
      <Box key={i} sx={{ display: 'flex', alignItems: 'center', gap: '16px', py: '11px', borderBottom: i < pts.length - 1 ? '1px solid #f5f5f7' : 'none' }}>
        <Typography sx={{ fontSize: '14px', fontWeight: 400, color: '#707070', letterSpacing: '-0.1px', width: '90px', flexShrink: 0 }}>{p.formattedDate}</Typography>
        <Box sx={{ flex: 1, background: '#f5f5f7', borderRadius: '999px', height: '4px', overflow: 'hidden' }}>
          <Box sx={{ height: '100%', borderRadius: '999px', width: `${p.score}%`, bgcolor: STATUS_FILL[p.status] }} />
        </Box>
        <Typography sx={{ fontSize: '15px', fontWeight: 600, letterSpacing: '-0.3px', width: '40px', textAlign: 'right', flexShrink: 0, fontVariantNumeric: 'tabular-nums', color: '#1d1d1f' }}>
          {p.score}%
        </Typography>
        <Typography sx={{ fontSize: '12px', fontWeight: 500, letterSpacing: '-0.1px', width: '36px', textAlign: 'right', flexShrink: 0, fontVariantNumeric: 'tabular-nums', color: p.delta === undefined ? '#707070' : p.delta > 0 ? '#34c759' : p.delta < 0 ? '#b64400' : '#707070' }}>
          {p.delta === undefined ? '—' : p.delta > 0 ? `+${p.delta}` : p.delta === 0 ? '—' : `${p.delta}`}
        </Typography>
        <Typography sx={{ fontSize: '12px', fontWeight: 500, letterSpacing: '-0.1px', color: '#707070', width: '110px', textAlign: 'right', flexShrink: 0 }}>
          {p.statusLabel}
        </Typography>
      </Box>
    ))}
  </Box>
);

const EmptyState: React.FC = () => (
  <Box sx={{ py: '48px', textAlign: 'center', border: '1.5px dashed #e8e8ed', borderRadius: '28px' }}>
    <Typography sx={{ fontSize: '15px', fontWeight: 500, color: '#707070', letterSpacing: '-0.1px' }}>
      Run your first evaluation to begin tracking compliance progression over time.
    </Typography>
  </Box>
);

// ── Public component ────────────────────────────────────────────────────────

export interface ScoreTrendProps {
  evaluations: TrendPoint[];
  loading?: boolean;
  selectedFramework: 1 | 2 | 3;
  onFrameworkChange: (fw: 1 | 2 | 3) => void;
}

const ScoreTrend: React.FC<ScoreTrendProps> = ({ evaluations, loading = false, selectedFramework, onFrameworkChange }) => {
  const displayPoints = useMemo(() => toDisplayPoints(evaluations), [evaluations]);
  const chartGeometry = useMemo(() => buildGeometry(displayPoints), [displayPoints]);

  return (
    <Paper sx={{ borderRadius: '28px', p: '28px', mb: '12px', boxShadow: 'none', border: '1px solid', borderColor: '#f5f5f7' }}>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: '24px' }}>
        <Typography sx={{ fontSize: '22px', fontWeight: 700, letterSpacing: '-0.4px', color: '#1d1d1f' }}>Compliance History</Typography>
        <FrameworkTabs selected={selectedFramework} onChange={onFrameworkChange} />
      </Box>
      {loading ? (
        <Box>
          <Skeleton variant="rectangular" height={80} sx={{ borderRadius: '12px', mb: 2 }} />
          <Skeleton variant="rectangular" height={140} sx={{ borderRadius: '12px', mb: 2 }} />
          <Skeleton variant="rectangular" height={200} sx={{ borderRadius: '12px' }} />
        </Box>
      ) : evaluations.length === 0 ? (
        <EmptyState />
      ) : (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.35, ease: 'easeOut' }}>
          <ScoreHero pts={displayPoints} />
          <TrendChart pts={displayPoints} geo={chartGeometry} />
          <EvaluationTable pts={displayPoints} />
        </motion.div>
      )}
    </Paper>
  );
};

export default ScoreTrend;
