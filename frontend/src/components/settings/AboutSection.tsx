import React from 'react';
import { Box, Paper, List, ListItem, ListItemIcon, ListItemText, Divider, Chip } from '@mui/material';
import { Info, Computer, CheckCircle, Shield } from '@mui/icons-material';
import type { SystemInfo } from '../../types/electron';
import SectionHeader from './SectionHeader';

interface AboutSectionProps {
  appVersion: string;
  systemInfo: SystemInfo | null;
  isElectron: boolean;
}

/** About section: version, platform, desktop/web mode. */
const AboutSection: React.FC<AboutSectionProps> = ({ appVersion, systemInfo, isElectron }) => (
  <Paper sx={{ mb: 3 }}>
    <Box sx={{ p: 3 }}>
      <SectionHeader icon={<Shield color="primary" />} title="About ComplianceGuard" />

      <List disablePadding>
        <ListItem>
          <ListItemIcon><Info /></ListItemIcon>
          <ListItemText
            primary="Version"
            secondary={appVersion}
          />
          <Chip label="Beta" size="small" color="primary" variant="outlined" />
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
