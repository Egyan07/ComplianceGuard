import React, { useState } from 'react';
import { Box, Paper, List, ListItem, ListItemIcon, ListItemText, ListItemSecondaryAction, Divider, Button, CircularProgress } from '@mui/material';
import { Storage, Backup } from '@mui/icons-material';
import SectionHeader from './SectionHeader';

interface DatabaseSectionProps {
  isElectron: boolean;
  onBackup: () => Promise<void>;
}

/** Database section: engine info + backup button. */
const DatabaseSection: React.FC<DatabaseSectionProps> = ({ isElectron, onBackup }) => {
  const [backingUp, setBackingUp] = useState(false);

  const handleBackup = async () => {
    setBackingUp(true);
    try {
      await onBackup();
    } finally {
      setBackingUp(false);
    }
  };

  return (
    <Paper sx={{ mb: 3 }}>
      <Box sx={{ p: 3 }}>
        <SectionHeader icon={<Storage color="primary" />} title="Database" />

        <List disablePadding>
          <ListItem>
            <ListItemIcon><Storage /></ListItemIcon>
            <ListItemText
              primary="Database Engine"
              secondary="SQLite 3 (local file)"
            />
          </ListItem>
          <Divider component="li" />
          <ListItem>
            <ListItemIcon><Backup /></ListItemIcon>
            <ListItemText
              primary="Backup Database"
              secondary="Creates a timestamped copy of your compliance database"
            />
            <ListItemSecondaryAction>
              <Button
                variant="outlined"
                size="small"
                onClick={handleBackup}
                disabled={backingUp || !isElectron}
                startIcon={backingUp ? <CircularProgress size={16} /> : <Backup />}
              >
                {backingUp ? 'Backing up...' : 'Backup Now'}
              </Button>
            </ListItemSecondaryAction>
          </ListItem>
        </List>
      </Box>
    </Paper>
  );
};

export default DatabaseSection;
