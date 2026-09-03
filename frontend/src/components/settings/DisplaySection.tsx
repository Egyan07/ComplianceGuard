import React from 'react';
import { Box, Paper, List, ListItem, ListItemIcon, ListItemText, ListItemSecondaryAction, Switch } from '@mui/material';
import { Palette } from '@mui/icons-material';
import SectionHeader from './SectionHeader';
import { useColorMode } from '../../hooks/useColorMode';

/**
 * Display section: dark-mode toggle, wired to the same mode store as the
 * top-bar switch so both surfaces stay in sync.
 */
const DisplaySection: React.FC = () => {
  const { mode, toggle } = useColorMode();
  const dark = mode === 'dark';

  return (
    <Paper sx={{ mb: 3 }}>
      <Box sx={{ p: 3 }}>
        <SectionHeader icon={<Palette color="primary" />} title="Display" />

        <List disablePadding>
          <ListItem>
            <ListItemIcon><Palette /></ListItemIcon>
            <ListItemText
              primary="Dark Mode"
              secondary={dark ? 'Dark theme is on — switch to the light theme' : 'Switch between light and dark theme'}
            />
            <ListItemSecondaryAction>
              <Switch
                checked={dark}
                onChange={toggle}
                slotProps={{ input: { 'aria-label': 'toggle dark mode', role: 'switch' } }}
              />
            </ListItemSecondaryAction>
          </ListItem>
        </List>
      </Box>
    </Paper>
  );
};

export default DisplaySection;
