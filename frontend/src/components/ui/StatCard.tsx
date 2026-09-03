import React from 'react';
import { Paper, Typography } from '@mui/material';
import { useTheme } from '@mui/material/styles';
import { Tone, toneColors } from '../../theme';

interface StatCardProps {
  label: string;
  value: React.ReactNode;
  /** Optional tone colours the leading value (defaults to primary). */
  tone?: Tone;
  secondary?: React.ReactNode;
  sx?: object;
}

/*
StatCard — the shared metric tile for fleet/dashboard numbers. The value is a
tabular display numeral; the label stays legible secondary text (never a
micro-overline).
*/
const StatCard: React.FC<StatCardProps> = ({ label, value, tone = 'info', secondary, sx }) => {
  const theme = useTheme();
  const c = toneColors(theme, tone);

  return (
    <Paper
      sx={{
        flex: 1,
        minWidth: 150,
        p: 2.5,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'flex-start',
        gap: 0.25,
        ...sx,
      }}
    >
      <Typography
        sx={{
          fontSize: '1.75rem',
          fontWeight: 750,
          letterSpacing: '-1.2px',
          lineHeight: 1.1,
          fontVariantNumeric: 'tabular-nums',
          color: c.main,
        }}
      >
        {value}
      </Typography>
      <Typography
        sx={{ fontSize: '0.75rem', fontWeight: 600, color: 'text.secondary', lineHeight: 1.4 }}
      >
        {label}
      </Typography>
      {secondary && (
        <Typography sx={{ fontSize: '0.75rem', color: 'text.secondary' }}>{secondary}</Typography>
      )}
    </Paper>
  );
};

export default StatCard;
