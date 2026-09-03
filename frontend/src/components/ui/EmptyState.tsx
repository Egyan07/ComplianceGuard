import React from 'react';
import { Box, Typography } from '@mui/material';

interface EmptyStateProps {
  icon?: React.ReactNode;
  title?: React.ReactNode;
  description?: React.ReactNode;
  action?: React.ReactNode;
  /** Draw a dashed container so the empty surface reads as a drop zone. */
  dashed?: boolean;
  sx?: object;
}

/*
EmptyState — the shared "nothing here yet / locked behind a tier" pattern:
an optional icon, a title, one line of context, and one optional action.
Centered by default; `sx` can compress it for inline panels.
*/
const EmptyState: React.FC<EmptyStateProps> = ({
  icon,
  title,
  description,
  action,
  dashed = false,
  sx,
}) => (
  <Box
    sx={{
      py: 6,
      px: 3,
      textAlign: 'center',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      gap: 0.75,
      ...(dashed && {
        m: 1,
        border: '1.5px dashed',
        borderColor: 'divider',
        borderRadius: '12px',
      }),
      ...sx,
    }}
  >
    {icon && <Box sx={{ color: 'text.disabled', mb: 0.5 }}>{icon}</Box>}
    {title && (
      <Typography sx={{ fontSize: '0.9rem', fontWeight: 600, color: 'text.primary' }}>
        {title}
      </Typography>
    )}
    {description && (
      <Typography sx={{ fontSize: '0.8rem', color: 'text.secondary', maxWidth: 420 }}>
        {description}
      </Typography>
    )}
    {action && <Box sx={{ mt: 1.5 }}>{action}</Box>}
  </Box>
);

export default EmptyState;
