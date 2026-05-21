/*
Dashboard — thin composition layer.

State and side-effects live in useDashboard.
Sub-components: DashboardHeader, CollectionSummary (see components/dashboard/).
*/

import React, { useState, useEffect } from 'react';
import { Alert, Box, Container, Skeleton, Snackbar } from '@mui/material';
import { useSearchParams } from 'react-router-dom';
import ScoreHero from './ScoreHero';
import EvidenceList from './EvidenceList';
import EvidenceUpload from './EvidenceUpload';
import UpgradePrompt from './UpgradePrompt';
import ControlHeatmap from './ControlHeatmap';
import DashboardHeader from './dashboard/DashboardHeader';
import CollectionSummary from './dashboard/CollectionSummary';
import { useDashboard } from '../hooks/useDashboard';
import { useLicense } from '../contexts/LicenseContext';

const isElectron = !!(window as any).electronAPI;

interface DashboardProps {
  onNavigate?: (page: string) => void;
}

const Dashboard: React.FC<DashboardProps> = ({ onNavigate }) => {
  const [uploadDialogOpen, setUploadDialogOpen] = useState(false);
  const [upgradePrompt, setUpgradePrompt] = useState({ open: false, feature: '', description: '' });

  const {
    state, collectingEvidence, evaluating, exportingPDF, syncingCloud,
    cloudConnected, fetchDashboardData, handleCollectEvidence,
    handleEvaluateCompliance, handleExportPDF, handleSyncToCloud, clearMessage,
    selectedFramework, setSelectedFramework, handleRescan,
  } = useDashboard();

  const { isFeatureAllowed } = useLicense();

  const [searchParams] = useSearchParams();
  useEffect(() => {
    const fw = Number(searchParams.get('fw') || '1');
    if (fw === 1 || fw === 2 || fw === 3) {
      setSelectedFramework(fw);
    }
  }, [searchParams, setSelectedFramework]);

  if (state.loading && !state.summary) {
    return (
      <Container maxWidth="xl" sx={{ mt: 4, mb: 4 }}>
        <Box sx={{ display: 'flex', gap: 3, mb: 3 }}>
          <Box sx={{ flex: 1 }}><Skeleton variant="rounded" height={280} /></Box>
          <Box sx={{ flex: 1 }}><Skeleton variant="rounded" height={280} /></Box>
        </Box>
        <Box>
          {[0, 1, 2, 3].map(i => (
            <Skeleton key={i} variant="rounded" height={48} sx={{ mb: 1 }} />
          ))}
        </Box>
      </Container>
    );
  }

  return (
    <Container maxWidth="xl" sx={{ mt: 4, mb: 4 }}>
      <DashboardHeader
        loading={state.loading}
        evaluation={state.evaluation}
        collectingEvidence={collectingEvidence}
        evaluating={evaluating}
        exportingPDF={exportingPDF}
        syncingCloud={syncingCloud}
        cloudConnected={cloudConnected}
        onRefresh={fetchDashboardData}
        onCollect={handleCollectEvidence}
        onEvaluate={handleEvaluateCompliance}
        onExportPDF={handleExportPDF}
        onSyncCloud={handleSyncToCloud}
        onUploadClick={() => setUploadDialogOpen(true)}
        onUpgradePrompt={(feature, description) => setUpgradePrompt({ open: true, feature, description })}
      />

      {state.error && (
        <Alert severity="error" sx={{ mb: 3 }} action={<button onClick={fetchDashboardData}>Retry</button>}>
          {state.error}
        </Alert>
      )}

      <Box sx={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
        <Box sx={{ display: { xs: 'flex', lg: 'flex' }, flexDirection: { xs: 'column', lg: 'row' }, gap: 3 }}>
          <Box sx={{ flex: 1 }}>
            <ScoreHero
              evaluation={state.evaluation}
              loading={state.loading}
              selectedFramework={selectedFramework}
            />
          </Box>
          <Box sx={{ flex: 1 }}>
            <CollectionSummary summary={state.summary} evaluation={state.evaluation} isElectron={isElectron} />
          </Box>
        </Box>
        <Box>
          <EvidenceList
            evidenceItems={state.evidenceItems}
            loading={state.loading}
            onItemClick={() => {}}
          />
        </Box>
        <ControlHeatmap
          controlResults={state.evaluation?.control_results ?? null}
          isElectron={isElectron}
          isProTier={isFeatureAllowed('per_control_scoring')}
          onDownloadScript={isElectron ? async (controlId: string) => {
            const api = (window as any).electronAPI;
            return api.downloadRemediationScript(controlId);
          } : undefined}
          onRescan={handleRescan}
        />
      </Box>

      {isElectron && (
        <EvidenceUpload
          open={uploadDialogOpen}
          onClose={() => setUploadDialogOpen(false)}
          onSuccess={() => { clearMessage(); fetchDashboardData(); }}
        />
      )}

      <UpgradePrompt
        feature={upgradePrompt.feature}
        description={upgradePrompt.description}
        open={upgradePrompt.open}
        onClose={() => setUpgradePrompt(prev => ({ ...prev, open: false }))}
        onGoToSettings={() => onNavigate?.('settings')}
      />

      <Snackbar open={!!state.successMessage} autoHideDuration={6000} onClose={clearMessage} anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}>
        <Alert onClose={clearMessage} severity="success">{state.successMessage}</Alert>
      </Snackbar>
    </Container>
  );
};

export default Dashboard;
