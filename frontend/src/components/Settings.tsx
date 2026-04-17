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
  CircularProgress
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
  Cloud
} from '@mui/icons-material';
import { useLicense } from '../contexts/LicenseContext';

const isElectron = !!(window as any).electronAPI;

const Settings: React.FC = () => {
  const [appVersion, setAppVersion] = useState('2.8.0');
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

  useEffect(() => {
    if (isElectron) {
      const api = (window as any).electronAPI;

      api.getAppVersion().then((v: string) => setAppVersion(v));
      api.getSystemInfo().then((info: any) => setSystemInfo(info));
      api.getUserSetting('dark_mode', 'false').then((val: string) => {
        setDarkMode(val === 'true');
      });
      api.cloudGetConfig().then((cfg: any) => setCloudConfig(cfg));
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
            <Typography variant="h6">About ComplianceGuard</Typography>
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
            <Typography variant="h6">License</Typography>
            <Chip
              label={tier === 'pro' ? 'PRO' : 'FREE'}
              size="small"
              color={tier === 'pro' ? 'success' : 'default'}
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
                      fontSize: '14px',
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

      {/* Database Section */}
      <Paper sx={{ mb: 3 }}>
        <Box sx={{ p: 3 }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 2 }}>
            <Storage color="primary" />
            <Typography variant="h6">Database</Typography>
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
              <Typography variant="h6">Cloud Sync</Typography>
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

      {/* Display Section */}
      <Paper sx={{ mb: 3 }}>
        <Box sx={{ p: 3 }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 2 }}>
            <Palette color="primary" />
            <Typography variant="h6">Display</Typography>
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
            <Typography variant="h6">Compliance Frameworks</Typography>
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
