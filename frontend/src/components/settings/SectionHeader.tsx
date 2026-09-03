import React from 'react';
import { Box, Typography } from '@mui/material';

interface SectionHeaderProps {
  icon: React.ReactNode;
  title: string;
  children?: React.ReactNode;
}

/** Consistent Settings section header: icon + title + optional trailing extras. */
const SectionHeader: React.FC<SectionHeaderProps> = ({ icon, title, children }) => (
  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.25, mb: 2.5 }}>
    <Box sx={{ display: 'flex', alignItems: 'center', color: 'primary.main' }}>{icon}</Box>
    <Typography
      sx={{
        fontSize: '0.9rem',
        fontWeight: 650,
        letterSpacing: '-0.1px',
        color: 'text.primary',
      }}
    >
      {title}
    </Typography>
    {children && <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>{children}</Box>}
  </Box>
);

export default SectionHeader;
