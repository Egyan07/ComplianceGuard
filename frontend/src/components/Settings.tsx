/*
Settings Component

Provides configuration options for ComplianceGuard including
app info, database management, and display preferences.
*/

import React, { useState, useEffect } from 'react';
import {
  Box,
  Container,
  Paper,
  Typography,
  Button,
  Divider,
  List,
  ListItem,
  ListItemIcon,
  ListItemText,
  ListItemSecondaryAction,
  Switch,
  Chip,
  Alert,
  Snackbar,
  CircularProgress,
  FormControl,
  Select,
  MenuItem,
  TextField,
} from '@mui/material';
import {
  Info,
  Storage,
  Backup,
  Computer,
  Shield,
  Palette,
  CheckCircle,
  VpnKey,
  Cloud,
  Schedule,
} from '@mui/icons-material';
import { useLicense } from '../contexts/LicenseContext';
import { VERSION } from '../constants';
import EnterprisePanel from './EnterprisePanel';

const Settings: React.FC = () => {
  const isElectron = !!(window as any).electronAPI;
  const [appVersion, setAppVersion] = useState(VERSION);
  const [systemInfo, setSystemInfo] = useState<any>(null);
  const [backingUp, setBackingUp] = useState(false);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [darkMode, setDarkMode] = useState(false);
  const [licenseKey, setLicenseKey] = useState('');
  const [activating, setActivating] = useState(false);
  const [cloudConfig, setCloudConfig] = useState<{ connected: boolean; serverUrl: string | null; email: string | null } | null>(null);
  const [cloudUrl, setCloudUrl] = useState('');
  const [cloudEmail, setCloudEmail] = useState('');
  const [cloudPassword, setCloudPassword] = useState('');
  const [connecting, setConnecting] = useState(false);
  const { tier, licenseInfo, activateLicense, deactivateLicense } = useLicense();
  const [schedule, setScheduleState] = useState<{
    config: { enabled: boolean; frequency: string; time: string };
    last_run_at: string | null;
    next_run_at: string | null;
    last_result: { success: boolean; evidence_count: number; error?: string } | null;
  } | null>(null);
  const [runningNow, setRunningNow] = useState(false);

  useEffect(() => {
    if (isElectron) {
      const api = (window as any).electronAPI;

      api.getAppVersion().then((v: string) => setAppVersion(v));
      api.getSystemInfo().then((info: any) => setSystemInfo(info));
      api.getUserSetting('dark_mode', 'false').then((val: string) => {
        setDarkMode(val === 'true');
      });
      api.cloudGetConfig().then((cfg: any) => setCloudConfig(cfg));
      api.getSchedule().then((s: any) => setScheduleState(s));
    }
  }, []);

  const handleBackup = async () => {
    if (!isElectron) return;
    setBackingUp(true);

    try {
      const api = (window as any).electronAPI;
      const result = await api.createBackup();

      if (result.error) {
        setError(result.error);
      } else {
        setSuccessMessage(`Database backed up successfully!`);
      }
    } catch (err: any) {
      setError(err.message);
    } finally {
      setBackingUp(false);
    }
  };

  const handleDarkModeToggle = async () => {
    const newValue = !darkMode;
    setDarkMode(newValue);

    if (isElectron) {
      const api = (window as any).electronAPI;
      await api.setUserSetting('dark_mode', String(newValue), 'boolean');
    }
  };

  const handleCloudConnect = async () => {
    if (!isElectron) return;
    setConnecting(true);
    setError(null);
    try {
      const api = (window as any).electronAPI;
      const result = await api.cloudConnect(cloudUrl, cloudEmail, cloudPassword);
      if (result.error) {
        setError(result.error);
      } else {
        setCloudConfig(result);
        setCloudPassword('');
        setSuccessMessage('Connected to cloud successfully!');
      }
    } catch (err: any) {
      setError(err.message);
    } finally {
      setConnecting(false);
    }
  };

  const handleCloudDisconnect = async () => {
    if (!isElectron) return;
    const api = (window as any).electronAPI;
    await api.cloudDisconnect();
    setCloudConfig({ connected: false, serverUrl: null, email: null });
    setSuccessMessage('Disconnected from cloud.');
  };

  const handleScheduleChange = async (patch: Partial<{ enabled: boolean; frequency: string; time: string }>) => {
    if (!isElectron || !schedule) return;
    const api = (window as any).electronAPI;
    const newConfig = { ...schedule.config, ...patch };
    const result = await api.setSchedule(newConfig);
    if (!result.error) {
      setScheduleState(prev => prev ? { ...prev, config: newConfig, next_run_at: result.next_run_at } : prev);
    }
  };

  const handleRunNow = async () => {
    if (!isElectron) return;
    setRunningNow(true);
    try {
      const api = (window as any).electronAPI;
      const result = await api.runCollectionNow();
      if (!result.error) {
        setScheduleState(prev => prev ? {
          ...prev,
          last_run_at: result.ran_at,
          last_result: result,
        } : prev);
      }
    } finally {
      setRunningNow(false);
    }
  };

  return (
    <Container maxWidth="md" sx={{ mt: 4, mb: 4 }}>
      <Typography variant="h4" component="h1" sx={{ fontWeight: 'bold', mb: 3 }}>
        Settings
      </Typography>

      {/* About Section */}
      <Paper sx={{ mb: 3 }}>
        <Box sx={{ p: 3 }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 2 }}>
            <Shield color="primary" />
            <Typography sx={{ fontSize: '0.6rem', fontWeight: 700, letterSpacing: '1.6px', textTransform: 'uppercase', color: 'text.disabled' }}>About ComplianceGuard</Typography>
          </Box>

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

      {/* License Section */}
      <Paper sx={{ mb: 3 }}>
        <Box sx={{ p: 3 }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 2 }}>
            <VpnKey color="primary" />
            <Typography sx={{ fontSize: '0.6rem', fontWeight: 700, letterSpacing: '1.6px', textTransform: 'uppercase', color: 'text.disabled' }}>License</Typography>
            <Chip
              label={tier === 'enterprise' ? 'ENTERPRISE' : tier === 'pro' ? 'PRO' : 'FREE'}
              size="small"
              color={tier === 'enterprise' ? 'primary' : tier === 'pro' ? 'success' : 'default'}
            />
          </Box>

          {tier === 'pro' ? (
            <Box>
              <List disablePadding>
                <ListItem>
                  <ListItemText
                    primary="License ID"
                    secondary={licenseInfo.licenseId || '—'}
                  />
                </ListItem>
                <Divider component="li" />
                <ListItem>
                  <ListItemText
                    primary="Email"
                    secondary={licenseInfo.email || '—'}
                  />
                </ListItem>
                <Divider component="li" />
                <ListItem>
                  <ListItemText
                    primary="Expires"
                    secondary={licenseInfo.expiresAt
                      ? `${new Date(licenseInfo.expiresAt).toLocaleDateString()} (${licenseInfo.daysRemaining} days remaining)`
                      : '—'}
                  />
                </ListItem>
              </List>
              <Box sx={{ mt: 2 }}>
                <Button
                  variant="outlined"
                  color="error"
                  size="small"
                  onClick={async () => {
                    await deactivateLicense();
                    setSuccessMessage('License deactivated.');
                  }}
                >
                  Deactivate License
                </Button>
              </Box>
            </Box>
          ) : (
            <Box>
              <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
                Enter a Pro license key to unlock all 29 controls, PDF reports, evaluation history, and more.
              </Typography>
              <Box sx={{ display: 'flex', gap: 1 }}>
                <Box sx={{ flex: 1 }}>
                  <input
                    type="text"
                    placeholder="Paste your license key here"
                    value={licenseKey}
                    onChange={(e) => setLicenseKey(e.target.value)}
                    style={{
                      width: '100%',
                      padding: '10px 12px',
                      border: '1px solid #D1D5DB',
                      borderRadius: '8px',
                      fontSize: '0.8rem',
                      fontFamily: 'monospace',
                    }}
                  />
                </Box>
                <Button
                  variant="contained"
                  disabled={activating || licenseKey.length < 10}
                  onClick={async () => {
                    setActivating(true);
                    setError(null);
                    try {
                      const result = await activateLicense(licenseKey);
                      if (result.valid) {
                        setSuccessMessage('License activated! Pro features unlocked.');
                        setLicenseKey('');
                      } else {
                        setError(result.error || 'Invalid license key.');
                      }
                    } catch (err: any) {
                      setError(err.message);
                    } finally {
                      setActivating(false);
                    }
                  }}
                >
                  {activating ? 'Activating...' : 'Activate'}
                </Button>
              </Box>
            </Box>
          )}
        </Box>
      </Paper>

      <EnterprisePanel />

      {/* Database Section */}
      <Paper sx={{ mb: 3 }}>
        <Box sx={{ p: 3 }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 2 }}>
            <Storage color="primary" />
            <Typography sx={{ fontSize: '0.6rem', fontWeight: 700, letterSpacing: '1.6px', textTransform: 'uppercase', color: 'text.disabled' }}>Database</Typography>
          </Box>

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

      {/* Cloud Sync Section */}
      {isElectron && (
        <Paper sx={{ mb: 3 }}>
          <Box sx={{ p: 3 }}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 2 }}>
              <Cloud color="primary" />
              <Typography sx={{ fontSize: '0.6rem', fontWeight: 700, letterSpacing: '1.6px', textTransform: 'uppercase', color: 'text.disabled' }}>Cloud Sync</Typography>
              {cloudConfig?.connected && (
                <Chip label="Connected" size="small" color="success" />
              )}
            </Box>
            {cloudConfig?.connected ? (
              <Box>
                <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
                  Connected as <strong>{cloudConfig.email}</strong>
                </Typography>
                <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
                  {cloudConfig.serverUrl}
                </Typography>
                <Button variant="outlined" color="error" size="small" onClick={handleCloudDisconnect}>
                  Disconnect
                </Button>
              </Box>
            ) : (
              <Box>
                <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
                  Connect to your ComplianceGuard web server to sync compliance data to the Cloud Dashboard.
                </Typography>
                <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
                  <input
                    type="text"
                    placeholder="Server URL (e.g. https://compliance.yourcompany.com)"
                    value={cloudUrl}
                    onChange={(e) => setCloudUrl(e.target.value)}
                    style={{ width: '100%', padding: '10px 12px', border: '1px solid #D1D5DB', borderRadius: '8px', fontSize: '14px' }}
                  />
                  <input
                    type="email"
                    placeholder="Email"
                    value={cloudEmail}
                    onChange={(e) => setCloudEmail(e.target.value)}
                    style={{ width: '100%', padding: '10px 12px', border: '1px solid #D1D5DB', borderRadius: '8px', fontSize: '14px' }}
                  />
                  <input
                    type="password"
                    placeholder="Password"
                    value={cloudPassword}
                    onChange={(e) => setCloudPassword(e.target.value)}
                    style={{ width: '100%', padding: '10px 12px', border: '1px solid #D1D5DB', borderRadius: '8px', fontSize: '14px' }}
                  />
                  <Button
                    variant="contained"
                    disabled={connecting || !cloudUrl || !cloudEmail || !cloudPassword}
                    onClick={handleCloudConnect}
                  >
                    {connecting ? 'Connecting...' : 'Connect'}
                  </Button>
                </Box>
              </Box>
            )}
          </Box>
        </Paper>
      )}

      {/* Automatic Collection — Electron only */}
      {isElectron && (
        <Paper sx={{ mb: 3 }}>
          <Box sx={{ p: 3 }}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 2 }}>
              <Schedule color="primary" />
              <Typography sx={{ fontSize: '0.6rem', fontWeight: 700, letterSpacing: '1.6px', textTransform: 'uppercase', color: 'text.disabled' }}>Automatic Collection</Typography>
            </Box>

            <List disablePadding>
              <ListItem>
                <ListItemText
                  primary="Enable automatic collection"
                  secondary="Collect evidence on a recurring schedule"
                />
                <ListItemSecondaryAction>
                  <Switch
                    checked={schedule?.config.enabled ?? false}
                    onChange={() => handleScheduleChange({ enabled: !schedule?.config.enabled })}
                    slotProps={{ input: { role: 'switch', 'aria-label': 'enable automatic collection' } as any }}
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
                      onChange={e => handleScheduleChange({ frequency: e.target.value })}
                    >
                      <MenuItem value="daily">Daily</MenuItem>
                      <MenuItem value="weekly">Weekly (Monday)</MenuItem>
                    </Select>
                  </FormControl>
                  <TextField
                    type="time"
                    size="small"
                    value={schedule?.config.time ?? '09:00'}
                    onChange={e => handleScheduleChange({ time: e.target.value })}
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
                    secondary: { style: { color: schedule?.last_result && !schedule.last_result.success ? 'red' : undefined } },
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
      )}

      {/* Display Section */}
      <Paper sx={{ mb: 3 }}>
        <Box sx={{ p: 3 }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 2 }}>
            <Palette color="primary" />
            <Typography sx={{ fontSize: '0.6rem', fontWeight: 700, letterSpacing: '1.6px', textTransform: 'uppercase', color: 'text.disabled' }}>Display</Typography>
          </Box>

          <List disablePadding>
            <ListItem>
              <ListItemIcon><Palette /></ListItemIcon>
              <ListItemText
                primary="Dark Mode"
                secondary="Switch between light and dark theme (coming soon)"
              />
              <ListItemSecondaryAction>
                <Switch
                  checked={darkMode}
                  onChange={handleDarkModeToggle}
                  disabled
                />
              </ListItemSecondaryAction>
            </ListItem>
          </List>
        </Box>
      </Paper>

      {/* Framework Info */}
      <Paper sx={{ mb: 3 }}>
        <Box sx={{ p: 3 }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 2 }}>
            <Shield color="primary" />
            <Typography sx={{ fontSize: '0.6rem', fontWeight: 700, letterSpacing: '1.6px', textTransform: 'uppercase', color: 'text.disabled' }}>Compliance Frameworks</Typography>
          </Box>

          <List disablePadding>
            <ListItem>
              <ListItemText
                primary="SOC 2 Type II"
                secondary="AICPA Trust Services Criteria — 29 controls across CC, Availability, Confidentiality, and Processing Integrity"
              />
              <Chip label="Active" size="small" color="success" />
            </ListItem>
            <Divider component="li" />
            <ListItem>
              <ListItemText
                primary="ISO 27001"
                secondary="Information security management"
              />
              <Chip label="Coming Soon" size="small" variant="outlined" />
            </ListItem>
            <Divider component="li" />
            <ListItem>
              <ListItemText
                primary="HIPAA"
                secondary="Health information privacy and security"
              />
              <Chip label="Coming Soon" size="small" variant="outlined" />
            </ListItem>
            <Divider component="li" />
            <ListItem>
              <ListItemText
                primary="PCI DSS"
                secondary="Payment card industry data security"
              />
              <Chip label="Coming Soon" size="small" variant="outlined" />
            </ListItem>
          </List>
        </Box>
      </Paper>

      {error && (
        <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError(null)}>
          {error}
        </Alert>
      )}

      <Snackbar
        open={!!successMessage}
        autoHideDuration={4000}
        onClose={() => setSuccessMessage(null)}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
      >
        <Alert onClose={() => setSuccessMessage(null)} severity="success">
          {successMessage}
        </Alert>
      </Snackbar>
    </Container>
  );
};

export default Settings;
