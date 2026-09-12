import React from 'react';
import { Box, Paper, List, ListItem, ListItemIcon, ListItemText, Divider, Chip, Typography } from '@mui/material';
import { Info, Computer, CheckCircle } from '@mui/icons-material';
import type { SystemInfo } from '../../types/electron';
import SectionHeader from './SectionHeader';

interface AboutSectionProps {
  appVersion: string;
  systemInfo: SystemInfo | null;
  isElectron: boolean;
}

// The app's brand mark: the "CG" monogram in a blue rounded square, identical
// to the Topbar logo (not a generic stock shield icon).
const cgMark = (
  <Box
    sx={{
      width: 28,
      height: 28,
      borderRadius: '7px',
      backgroundColor: 'primary.main',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      flexShrink: 0,
    }}
  >
    <Typography sx={{ color: '#fff', fontWeight: 700, fontSize: '0.7rem', letterSpacing: '-0.5px' }}>
      CG
    </Typography>
  </Box>
);

/** About section: version, platform, desktop/web mode. */
const AboutSection: React.FC<AboutSectionProps> = ({ appVersion, systemInfo, isElectron }) => (
  <Paper sx={{ mb: 3 }}>
    <Box sx={{ p: 3 }}>
      <SectionHeader icon={cgMark} title="About ComplianceGuard" />

      <List disablePadding>
        <ListItem>
          <ListItemIcon><Info /></ListItemIcon>
          <ListItemText
            primary="Version"
            secondary={appVersion}
          />
        </ListItem>
        <Divider component="li" />
        <ListItem>
          <ListItemIcon><Computer /></ListItemIcon>
          <ListItemText
            primary="Platform"
            secondary={systemInfo
              ? `${systemInfo.platform} (${systemInfo.arch}) — Electron ${systemInfo.electronVersion}`
              : 'Loading...'}
          />
        </ListItem>
        <Divider component="li" />
        <ListItem>
          <ListItemIcon><CheckCircle /></ListItemIcon>
          <ListItemText
            primary="Mode"
            secondary={isElectron ? 'Desktop Application (Electron)' : 'Web Browser'}
          />
          <Chip
            label={isElectron ? 'Desktop' : 'Web'}
            size="small"
            color={isElectron ? 'success' : 'default'}
          />
        </ListItem>
      </List>
    </Box>
  </Paper>
);

export default AboutSection;
