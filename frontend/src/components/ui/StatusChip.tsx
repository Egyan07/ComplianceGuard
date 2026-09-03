import React from 'react';
import { Box } from '@mui/material';
import { useTheme } from '@mui/material/styles';
import { RADIUS, Tone, toneColors } from '../../theme';

interface StatusChipProps {
  /** Semantic tone — one language for pass/fail/warn/info across the app. */
  tone: Tone;
  label: React.ReactNode;
  /** Small leading indicator dot (state markers like the hero status). */
  dot?: boolean;
  /** Pill shape for floating badges; rectangular otherwise. */
  pill?: boolean;
  size?: 'sm' | 'md';
  sx?: object;
  title?: string;
}

/*
StatusChip — renders a tone as a tinted chip. Consumes the canonical tone
triples from theme.ts; no component should invent its own success/warning/
error hexes.
*/
const StatusChip: React.FC<StatusChipProps> = ({
  tone,
  label,
  dot = false,
  pill = false,
  size = 'sm',
  sx,
  title,
}) => {
  const theme = useTheme();
  const c = toneColors(theme, tone);
  const height = size === 'sm' ? 20 : 24;
  const fontSize = size === 'sm' ? '0.7rem' : '0.75rem';

  return (
    <Box
      component="span"
      title={title}
      sx={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: dot ? 0.5 : 0,
        height,
        px: pill ? 1.5 : 1,
        borderRadius: pill ? RADIUS.pill : RADIUS.sm,
        backgroundColor: c.surface,
        color: c.onSurface,
        border: `1px solid ${c.border}`,
        fontSize,
        fontWeight: 600,
        lineHeight: 1,
        whiteSpace: 'nowrap',
        flexShrink: 0,
        ...sx,
      }}
    >
      {dot && (
        <Box
          sx={{
            width: 6,
            height: 6,
            borderRadius: '50%',
            backgroundColor: c.main,
            flexShrink: 0,
          }}
        />
      )}
      {label}
    </Box>
  );
};

export default StatusChip;
