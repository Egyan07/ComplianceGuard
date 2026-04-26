/*
Dashboard — thin composition layer.

State and side-effects live in useDashboard.
Sub-components: DashboardHeader, CollectionSummary (see components/dashboard/).
*/

import React, { useState } from 'react';
import { Alert, Box, CircularProgress, Container, Snackbar } from '@mui/material';
import ComplianceScore from './ComplianceScore';
import EvidenceList from './EvidenceList';
import EvidenceUpload from './EvidenceUpload';
import UpgradePrompt from './UpgradePrompt';
import DashboardHeader from './dashboard/DashboardHeader';
import CollectionSummary from './dashboard/CollectionSummary';
import { useDashboard } from '../hooks/useDashboard';
import { EvidenceItem } from '../services/api';

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
  } = useDashboard();

  if (state.loading && !state.summary) {
    return (
      <Container maxWidth="xl" sx={{ mt: 4, mb: 4 }}>
        <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: 400 }}>
          <CircularProgress size={60} />
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
            <ComplianceScore
              metrics={state.summary?.compliance_metrics || { s3_encryption_compliance: 0, iam_policy_compliance: 0, overall_compliance_score: 0 }}
              evaluation={state.evaluation}
              loading={state.loading}
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
            onItemClick={(_item: EvidenceItem) => {}}
          />
        </Box>
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
