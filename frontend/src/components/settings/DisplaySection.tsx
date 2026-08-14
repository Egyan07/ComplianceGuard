import React from 'react';
import { Box, Paper, List, ListItem, ListItemIcon, ListItemText, ListItemSecondaryAction, Switch } from '@mui/material';
import { Palette } from '@mui/icons-material';
import SectionHeader from './SectionHeader';

interface DisplaySectionProps {
  darkMode: boolean;
}

/** Display section: dark-mode toggle (currently disabled in the app). */
const DisplaySection: React.FC<DisplaySectionProps> = ({ darkMode }) => (
  <Paper sx={{ mb: 3 }}>
    <Box sx={{ p: 3 }}>
      <SectionHeader icon={<Palette color="primary" />} title="Display" />

      <List disablePadding>
        <ListItem>
          <ListItemIcon><Palette /></ListItemIcon>
          <ListItemText
            primary="Dark Mode"
            secondary="Switch between light and dark theme"
          />
          <ListItemSecondaryAction>
            <Switch
              checked={darkMode}
              onChange={() => {}}
              disabled
            />
          </ListItemSecondaryAction>
        </ListItem>
      </List>
    </Box>
  </Paper>
);

export default DisplaySection;
