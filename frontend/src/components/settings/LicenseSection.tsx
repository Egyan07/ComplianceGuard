import React, { useState } from 'react';
import { Box, Paper, Typography, List, ListItem, ListItemText, Divider, Chip, Button } from '@mui/material';
import { VpnKey } from '@mui/icons-material';
import SectionHeader from './SectionHeader';
import { getErrorMessage } from '../../lib/errors';

export interface LicenseSectionInfo {
  licenseId?: string | null;
  email?: string | null;
  expiresAt?: string | null;
  daysRemaining?: number | null;
}

interface LicenseSectionProps {
  tier: string;
  licenseInfo: LicenseSectionInfo;
  activateLicense: (key: string) => Promise<{ valid: boolean; error?: string }>;
  deactivateLicense: () => Promise<void>;
  onSuccess: (msg: string) => void;
  onError: (msg: string | null) => void;
}

/** License section: activation form (free) or details + deactivate (Pro/Enterprise). */
const LicenseSection: React.FC<LicenseSectionProps> = ({
  tier,
  licenseInfo,
  activateLicense,
  deactivateLicense,
  onSuccess,
  onError,
}) => {
  const [licenseKey, setLicenseKey] = useState('');
  const [activating, setActivating] = useState(false);

  return (
    <Paper sx={{ mb: 3 }}>
      <Box sx={{ p: 3 }}>
        <SectionHeader icon={<VpnKey color="primary" />} title="License">
          <Chip
            label={tier === 'enterprise' ? 'ENTERPRISE' : tier === 'pro' ? 'PRO' : 'FREE'}
            size="small"
            color={tier === 'enterprise' ? 'primary' : tier === 'pro' ? 'success' : 'default'}
          />
        </SectionHeader>

        {tier !== 'free' ? (
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
                  onSuccess('License deactivated.');
                }}
              >
                Deactivate License
              </Button>
            </Box>
          </Box>
        ) : (
          <Box>
            <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
              Enter a Pro license key to unlock all 54 controls, PDF reports, evaluation history, and more.
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
                  onError(null); // clear previous error
                  try {
                    const result = await activateLicense(licenseKey);
                    if (result.valid) {
                      onSuccess('License activated! Pro features unlocked.');
                      setLicenseKey('');
                    } else {
                      onError(result.error || 'Invalid license key.');
                    }
                  } catch (err) {
                    onError(getErrorMessage(err));
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
  );
};

export default LicenseSection;
