import React, { useState } from 'react';
import { Box, Paper, Typography, Chip, Button, TextField } from '@mui/material';
import { Cloud } from '@mui/icons-material';
import SectionHeader from './SectionHeader';
import { getErrorMessage } from '../../lib/errors';

export interface CloudSyncConfig {
  connected: boolean;
  serverUrl: string | null;
  email: string | null;
}

interface CloudSyncSectionProps {
  cloudConfig: CloudSyncConfig | null;
  onConnect: (serverUrl: string, email: string, password: string) => Promise<void>;
  onDisconnect: () => Promise<void>;
  onSuccess: (msg: string) => void;
  onError: (msg: string) => void;
}

/** Cloud Sync section: connect/disconnect to a ComplianceGuard web server. */
const CloudSyncSection: React.FC<CloudSyncSectionProps> = ({
  cloudConfig,
  onConnect,
  onDisconnect,
  onSuccess,
  onError,
}) => {
  const [cloudUrl, setCloudUrl] = useState('');
  const [cloudEmail, setCloudEmail] = useState('');
  const [cloudPassword, setCloudPassword] = useState('');
  const [connecting, setConnecting] = useState(false);

  const handleCloudConnect = async () => {
    setConnecting(true);
    onError('');
    try {
      await onConnect(cloudUrl, cloudEmail, cloudPassword);
      setCloudPassword('');
    } catch (err) {
      onError(getErrorMessage(err));
    } finally {
      setConnecting(false);
    }
  };

  const handleCloudDisconnect = async () => {
    await onDisconnect();
    onSuccess('Disconnected from cloud.');
  };

  return (
    <Paper sx={{ mb: 3 }}>
      <Box sx={{ p: 3 }}>
        <SectionHeader icon={<Cloud color="primary" />} title="Cloud Sync">
          {cloudConfig?.connected && (
            <Chip label="Connected" size="small" color="success" />
          )}
        </SectionHeader>
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
              <TextField
                size="small"
                placeholder="Server URL (e.g. https://compliance.yourcompany.com)"
                value={cloudUrl}
                onChange={(e) => setCloudUrl(e.target.value)}
                fullWidth
              />
              <TextField
                type="email"
                size="small"
                placeholder="Email"
                value={cloudEmail}
                onChange={(e) => setCloudEmail(e.target.value)}
                fullWidth
              />
              <TextField
                type="password"
                size="small"
                placeholder="Password"
                value={cloudPassword}
                onChange={(e) => setCloudPassword(e.target.value)}
                fullWidth
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
  );
};

export default CloudSyncSection;
