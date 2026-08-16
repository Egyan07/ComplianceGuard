/*
Settings Component

Provides configuration options for ComplianceGuard including
app info, database management, and display preferences.

The page is composed of section components in ./settings/ (About, License,
Database, Cloud Sync, Automatic Collection, Display, Frameworks). This
container owns the shared page state (fetched values, success/error messages)
and the handlers each section triggers.
*/

import React, { useState, useEffect } from 'react';
import {
  Container,
  Typography,
  Alert,
  Snackbar,
} from '@mui/material';
import { useLicense } from '../contexts/LicenseContext';
import { VERSION } from '../constants';
import { getElectronAPI, isElectronMode } from '../services/electron';
import { getErrorMessage } from '../lib/errors';
import type { ScheduleConfig, SystemInfo } from '../types/electron';
import EnterprisePanel from './EnterprisePanel';
import AboutSection from './settings/AboutSection';
import LicenseSection from './settings/LicenseSection';
import DatabaseSection from './settings/DatabaseSection';
import CloudSyncSection, { CloudSyncConfig } from './settings/CloudSyncSection';
import ScheduleSection, { ScheduleState } from './settings/ScheduleSection';
import DisplaySection from './settings/DisplaySection';
import FrameworksSection from './settings/FrameworksSection';

const Settings: React.FC = () => {
  const isElectron = isElectronMode();
  const [appVersion, setAppVersion] = useState(VERSION);
  const [systemInfo, setSystemInfo] = useState<SystemInfo | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [darkMode, setDarkMode] = useState(false);
  const [cloudConfig, setCloudConfig] = useState<CloudSyncConfig | null>(null);
  const { tier, licenseInfo, activateLicense, deactivateLicense } = useLicense();
  const [schedule, setScheduleState] = useState<ScheduleState | null>(null);

  useEffect(() => {
    if (isElectron) {
      const api = getElectronAPI();

      api.getAppVersion().then((v: string) => setAppVersion(v)).catch(() => {});
      api.getSystemInfo().then((info) => setSystemInfo(info)).catch(() => {});
      api.getUserSetting('dark_mode', 'false').then((val) => {
        setDarkMode(String(val) === 'true');
      }).catch(() => {});
      api.cloudGetConfig().then((cfg) => setCloudConfig(cfg)).catch(() => {});
      api.getSchedule().then((s) => setScheduleState(s)).catch(() => {});
    }
  }, [isElectron]);

  const handleBackup = async () => {
    if (!isElectron) return;

    try {
      const api = getElectronAPI();
      const result = await api.createBackup();

      if (result.error) {
        setError(result.error);
      } else {
        setSuccessMessage(`Database backed up successfully!`);
      }
    } catch (err) {
      setError(getErrorMessage(err));
    }
  };

  const handleCloudConnect = async (cloudUrl: string, cloudEmail: string, cloudPassword: string) => {
    if (!isElectron) return;
    try {
      const api = getElectronAPI();
      const result = await api.cloudConnect(cloudUrl, cloudEmail, cloudPassword);
      if ('error' in result) {
        setError(result.error);
      } else {
        setCloudConfig(result);
        setSuccessMessage('Connected to cloud successfully!');
      }
    } catch (err) {
      setError(getErrorMessage(err));
    }
  };

  const handleCloudDisconnect = async () => {
    if (!isElectron) return;
    const api = getElectronAPI();
    await api.cloudDisconnect();
    setCloudConfig({ connected: false, serverUrl: null, email: null });
  };

  const handleScheduleChange = async (patch: Partial<ScheduleConfig>) => {
    if (!isElectron || !schedule) return;
    const api = getElectronAPI();
    const newConfig: ScheduleConfig = { ...schedule.config, ...patch };
    const result = await api.setSchedule(newConfig);
    if ('error' in result) return;
    setScheduleState(prev => prev ? { ...prev, config: newConfig, next_run_at: result.next_run_at } : prev);
  };

  const handleRunNow = async () => {
    if (!isElectron) return;
    try {
      const api = getElectronAPI();
      const result = await api.runCollectionNow();
      if ('error' in result) return;
      setScheduleState(prev => prev ? {
        ...prev,
        last_run_at: result.ran_at,
        last_result: result,
      } : prev);
    } catch (err) {
      setError(getErrorMessage(err));
    }
  };

  const handleDeactivateLicense = async () => {
    await deactivateLicense();
    setSuccessMessage('License deactivated.');
  };

  return (
    <Container maxWidth="md" sx={{ mt: 4, mb: 4 }}>
      <Typography variant="h4" component="h1" sx={{ fontWeight: 'bold', mb: 3 }}>
        Settings
      </Typography>

      <AboutSection appVersion={appVersion} systemInfo={systemInfo} isElectron={isElectron} />

      <LicenseSection
        tier={tier}
        licenseInfo={licenseInfo}
        activateLicense={activateLicense}
        deactivateLicense={handleDeactivateLicense}
        onSuccess={setSuccessMessage}
        onError={setError}
      />

      <EnterprisePanel />

      <DatabaseSection isElectron={isElectron} onBackup={handleBackup} />

      {isElectron && (
        <CloudSyncSection
          cloudConfig={cloudConfig}
          onConnect={handleCloudConnect}
          onDisconnect={handleCloudDisconnect}
          onSuccess={setSuccessMessage}
          onError={setError}
        />
      )}

      {isElectron && (
        <ScheduleSection
          schedule={schedule}
          onChange={handleScheduleChange}
          onRunNow={handleRunNow}
        />
      )}

      <DisplaySection darkMode={darkMode} />

      <FrameworksSection />

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
