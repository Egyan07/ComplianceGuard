import React from 'react';
import { Box, Typography } from '@mui/material';

interface PageHeaderProps {
  title: string;
  subtitle?: React.ReactNode;
  actions?: React.ReactNode;
  sx?: object;
}

/*
PageHeader — the single page-title treatment. Every top-level page (Dashboard,
History, Settings, Cloud, Frameworks) uses this so a real h1 hierarchy stays
consistent and the subtitle/actions slot is standardised.
*/
const PageHeader: React.FC<PageHeaderProps> = ({ title, subtitle, actions, sx }) => (
  <Box
    sx={{
      display: 'flex',
      alignItems: 'flex-start',
      justifyContent: 'space-between',
      flexWrap: 'wrap',
      gap: 2,
      mb: 3,
      ...sx,
    }}
  >
    <Box sx={{ minWidth: 0 }}>
      <Typography component="h1" variant="h1">
        {title}
      </Typography>
      {subtitle && (
        <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5, maxWidth: 640 }}>
          {subtitle}
        </Typography>
      )}
    </Box>
    {actions && (
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, flexWrap: 'wrap' }}>
        {actions}
      </Box>
    )}
  </Box>
);

export default PageHeader;
