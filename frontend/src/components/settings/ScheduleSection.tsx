import React, { useState } from 'react';
import {
  Box, Paper, Typography, List, ListItem, ListItemText, ListItemSecondaryAction,
  Divider, Switch, FormControl, Select, MenuItem, TextField, Button, CircularProgress,
} from '@mui/material';
import { useTheme } from '@mui/material/styles';
import { Schedule } from '@mui/icons-material';
import type { ScheduleConfig, CollectionResult } from '../../types/electron';
import SectionHeader from './SectionHeader';

export interface ScheduleState {
  config: ScheduleConfig;
  last_run_at: string | null;
  next_run_at: string | null;
  last_result: CollectionResult | null;
}

interface ScheduleSectionProps {
  schedule: ScheduleState | null;
  onChange: (patch: Partial<ScheduleConfig>) => void;
  onRunNow: () => Promise<void>;
}

/** Automatic Collection section: enable toggle, frequency/time, run now, last run. */
const ScheduleSection: React.FC<ScheduleSectionProps> = ({ schedule, onChange, onRunNow }) => {
  const theme = useTheme();
  const [runningNow, setRunningNow] = useState(false);

  const handleRunNow = async () => {
    setRunningNow(true);
    try {
      await onRunNow();
    } finally {
      setRunningNow(false);
    }
  };

  return (
    <Paper sx={{ mb: 3 }}>
      <Box sx={{ p: 3 }}>
        <SectionHeader icon={<Schedule color="primary" />} title="Automatic Collection" />

        <List disablePadding>
          <ListItem>
            <ListItemText
              primary="Enable automatic collection"
              secondary="Collect evidence on a recurring schedule"
            />
            <ListItemSecondaryAction>
              <Switch
                checked={schedule?.config.enabled ?? false}
                onChange={() => onChange({ enabled: !schedule?.config.enabled })}
                slotProps={{ input: { role: 'switch', 'aria-label': 'enable automatic collection' } }}
              />
            </ListItemSecondaryAction>
          </ListItem>
          <Divider component="li" />
          <ListItem>
            <ListItemText primary="Frequency" />
            <ListItemSecondaryAction>
              <FormControl size="small" disabled={!schedule?.config.enabled} sx={{ minWidth: 120, mr: 1 }}>
                <Select
                  value={schedule?.config.frequency ?? 'daily'}
                  onChange={e => onChange({ frequency: e.target.value as ScheduleConfig['frequency'] })}
                >
                  <MenuItem value="daily">Daily</MenuItem>
                  <MenuItem value="weekly">Weekly (Monday)</MenuItem>
                </Select>
              </FormControl>
              <TextField
                type="time"
                size="small"
                value={schedule?.config.time ?? '09:00'}
                onChange={e => onChange({ time: e.target.value })}
                disabled={!schedule?.config.enabled}
                sx={{ width: 120 }}
                slotProps={{ htmlInput: { step: 300 } }}
              />
            </ListItemSecondaryAction>
          </ListItem>
          <Divider component="li" />
          <ListItem>
            <ListItemText
              primary="Last run"
              secondary={
                schedule?.last_result
                  ? schedule.last_result.success
                    ? `${schedule.last_result.evidence_count} items collected`
                    : schedule.last_result.error ?? 'Failed'
                  : 'Never'
              }
              slotProps={{
                secondary: { style: { color: schedule?.last_result && !schedule.last_result.success ? theme.palette.error.main : undefined } },
              }}
            />
            {schedule?.next_run_at && (
              <ListItemSecondaryAction>
                <Typography variant="caption" color="text.secondary">
                  Next: {new Date(schedule.next_run_at).toLocaleString()}
                </Typography>
              </ListItemSecondaryAction>
            )}
          </ListItem>
          <Divider component="li" />
          <ListItem>
            <Button
              variant="outlined"
              size="small"
              onClick={handleRunNow}
              disabled={runningNow}
              startIcon={runningNow ? <CircularProgress size={14} /> : undefined}
            >
              {runningNow ? 'Running...' : 'Run Now'}
            </Button>
          </ListItem>
        </List>
      </Box>
    </Paper>
  );
};

export default ScheduleSection;
