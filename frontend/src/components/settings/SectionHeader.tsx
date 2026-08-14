import React from 'react';
import { Box, Typography } from '@mui/material';

interface SectionHeaderProps {
  icon: React.ReactNode;
  title: string;
  children?: React.ReactNode;
}

/** Consistent Settings section header: icon + overline title + optional extras. */
const SectionHeader: React.FC<SectionHeaderProps> = ({ icon, title, children }) => (
  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 2 }}>
    {icon}
    <Typography sx={{ fontSize: '0.6rem', fontWeight: 700, letterSpacing: '1.6px', textTransform: 'uppercase', color: 'text.disabled' }}>
      {title}
    </Typography>
    {children}
  </Box>
);

export default SectionHeader;
