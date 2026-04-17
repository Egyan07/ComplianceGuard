/*
Main Dashboard Component

Integrates ComplianceScore and EvidenceList components with a responsive
grid layout using Material-UI. Works in both Electron and web modes.
*/

import React, { useState, useEffect } from 'react';
import {
  Box,
  Container,
  Paper,
  Typography,
  Button,
  CircularProgress,
  Alert,
  Snackbar
} from '@mui/material';
import {
  Refresh,
  CloudUpload,
  Assessment,
  Upload,
  PictureAsPdf,
  CloudSync as CloudSyncIcon
} from '@mui/icons-material';
import ComplianceScore from './ComplianceScore';
import EvidenceList from './EvidenceList';
import EvidenceUpload from './EvidenceUpload';
import { useLicense } from '../contexts/LicenseContext';
import UpgradePrompt from './UpgradePrompt';
import {
  getEvidenceSummary,
  getEvidenceItems,
  getMockEvidenceSummary,
  collectEvidence,
  evaluateCompliance,
  EvidenceSummary,
  EvidenceItem,
  ComplianceEvaluation
} from '../services/api';

const isElectron = !!(window as any).electronAPI;

interface DashboardProps {
  onNavigate?: (page: string) => void;
}

interface DashboardState {
  summary: EvidenceSummary | null;
  evidenceItems: EvidenceItem[];
  evaluation: ComplianceEvaluation | null;
  loading: boolean;
  error: string | null;
  successMessage: string | null;
}

const Dashboard: React.FC<DashboardProps> = ({ onNavigate }) => {
  const [state, setState] = useState<DashboardState>({
    summary: null,
    evidenceItems: [],
    evaluation: null,
    loading: true,
    error: null,
    successMessage: null
  });

  const [collectingEvidence, setCollectingEvidence] = useState(false);
  const [evaluating, setEvaluating] = useState(false);
  const [exportingPDF, setExportingPDF] = useState(false);
  const [syncingCloud, setSyncingCloud] = useState(false);
  const [cloudConnected, setCloudConnected] = useState(false);
  const [uploadDialogOpen, setUploadDialogOpen] = useState(false);
  const [upgradePrompt, setUpgradePrompt] = useState<{ open: boolean; feature: string; description: string }>({
    open: false, feature: '', description: ''
  });
  const { isFeatureAllowed } = useLicense();

  const fetchDashboardData = async () => {
    setState(prev => ({ ...prev, loading: true, error: null }));

    try {
      let summary: EvidenceSummary;
      let evidenceItems: EvidenceItem[];

      try {
        summary = await getEvidenceSummary();
      } catch (apiError) {
        console.warn('Could not fetch summary, using defaults:', apiError);
        summary = getMockEvidenceSummary();
      }

      try {
        evidenceItems = await getEvidenceItems();
      } catch (apiError) {
        console.warn('Could not fetch evidence items:', apiError);
        evidenceItems = [];
      }

      // Update compliance metrics from evaluation if we have one
      if (state.evaluation) {
        summary.compliance_metrics.overall_compliance_score =
          Math.round(state.evaluation.overall_score);
      }

      setState(prev => ({
        ...prev,
        summary,
        evidenceItems,
        loading: false
      }));

    } catch (error) {
      setState(prev => ({
        ...prev,
        loading: false,
        error: 'Failed to load dashboard data. Please try again.'
      }));
      console.error('Dashboard data fetch error:', error);
    }
  };

  const handleCollectEvidence = async () => {
    setCollectingEvidence(true);
    setState(prev => ({ ...prev, error: null }));

    try {
      const result = await collectEvidence();

      if (result.error) {
        setState(prev => ({ ...prev, error: `Evidence collection failed: ${result.error}` }));
      } else {
        setState(prev => ({
          ...prev,
          successMessage: `Evidence collection complete! ${result.evidence_count || 0} items collected.`
        }));

        // Refresh dashboard after collection
        setTimeout(fetchDashboardData, 1000);
      }

    } catch (error: any) {
      setState(prev => ({
        ...prev,
        error: error.message || 'Failed to collect evidence. Please check your configuration.'
      }));
      console.error('Evidence collection error:', error);
    } finally {
      setCollectingEvidence(false);
    }
  };

  const handleEvaluateCompliance = async () => {
    if (!isElectron) return;

    setEvaluating(true);
    setState(prev => ({ ...prev, error: null }));

    try {
      const evaluation = await evaluateCompliance();

      setState(prev => ({
        ...prev,
        evaluation,
        successMessage: `Compliance evaluation complete! Score: ${evaluation.overall_score.toFixed(1)}%`
      }));

      // Refresh to update metrics
      setTimeout(fetchDashboardData, 500);

    } catch (error: any) {
      setState(prev => ({
        ...prev,
        error: error.message || 'Failed to evaluate compliance.'
      }));
    } finally {
      setEvaluating(false);
    }
  };

  const handleExportPDF = async () => {
    if (!isElectron) return;
    setExportingPDF(true);
    setState(prev => ({ ...prev, error: null }));

    try {
      const api = (window as any).electronAPI;
      const result = await api.exportPDFReport(1);

      if (result.error) {
        setState(prev => ({ ...prev, error: result.error }));
      } else if (result.cancelled) {
        // User cancelled save dialog, do nothing
      } else {
        setState(prev => ({
          ...prev,
          successMessage: `PDF report exported successfully!`
        }));
      }
    } catch (error: any) {
      setState(prev => ({ ...prev, error: error.message || 'Failed to export PDF.' }));
    } finally {
      setExportingPDF(false);
    }
  };

  const handleEvidenceItemClick = (item: EvidenceItem) => {
    console.log('Evidence item clicked:', item);
  };

  const handleCloseSnackbar = () => {
    setState(prev => ({ ...prev, error: null, successMessage: null }));
  };

  const handleSyncToCloud = async () => {
    if (!isElectron) return;
    setSyncingCloud(true);
    setState(prev => ({ ...prev, error: null }));
    try {
      const api = (window as any).electronAPI;
      const levelMap: Record<string, string> = {
        compliant: 'compliant',
        partial_compliance: 'at_risk',
        at_risk: 'at_risk',
        non_compliant: 'critical',
      };
      const result = await api.cloudSync({
        overall_score: state.evaluation?.overall_score ?? null,
        compliance_level: state.evaluation?.status
          ? (levelMap[state.evaluation.status] ?? state.evaluation.status)
          : null,
        evidence_count: state.summary?.total_collections ?? null,
      });
      if (result.error) {
        setState(prev => ({ ...prev, error: result.error }));
      } else {
        setState(prev => ({ ...prev, successMessage: 'Synced to cloud successfully!' }));
      }
    } catch (err: any) {
      setState(prev => ({ ...prev, error: err.message || 'Cloud sync failed.' }));
    } finally {
      setSyncingCloud(false);
    }
  };

  useEffect(() => {
    fetchDashboardData();
    if (isElectron) {
      const api = (window as any).electronAPI;
      api.cloudGetConfig().then((cfg: any) => setCloudConnected(!!cfg?.connected));
    }
  }, []);

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
      {/* Header Section */}
      <Box sx={{ mb: 4 }}>
        <Box sx={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          mb: 2,
          flexWrap: 'wrap',
          gap: 2
        }}>
          <Box>
            <Typography variant="h4" component="h1" sx={{ fontWeight: 'bold' }} gutterBottom>
              ComplianceGuard Dashboard
            </Typography>
            <Typography variant="body1" color="text.secondary">
              {isElectron
                ? 'Monitor your SOC 2 compliance status - Desktop Mode'
                : 'Monitor your SOC 2 compliance status'}
            </Typography>
          </Box>
          <Box sx={{ display: 'flex', gap: 2 }}>
            <Button
              variant="outlined"
              startIcon={<Refresh />}
              onClick={fetchDashboardData}
              disabled={state.loading}
            >
              Refresh
            </Button>
            {isElectron && (
              <>
                <Button
                  variant="outlined"
                  startIcon={<Upload />}
                  onClick={() => {
                    if (isFeatureAllowed('evidence_upload')) {
                      setUploadDialogOpen(true);
                    } else {
                      setUpgradePrompt({ open: true, feature: 'Upload Evidence', description: 'Manually upload policy documents, screenshots, and compliance evidence mapped to SOC 2 controls.' });
                    }
                  }}
                >
                  Upload Evidence
                </Button>
                {cloudConnected && (
                  <Button
                    variant="outlined"
                    startIcon={syncingCloud ? <CircularProgress size={16} /> : <CloudSyncIcon />}
                    onClick={handleSyncToCloud}
                    disabled={syncingCloud}
                  >
                    {syncingCloud ? 'Syncing...' : 'Sync to Cloud'}
                  </Button>
                )}
                <Button
                  variant="outlined"
                  color="secondary"
                  startIcon={<Assessment />}
                  onClick={handleEvaluateCompliance}
                  disabled={evaluating}
                >
                  {evaluating ? 'Evaluating...' : 'Evaluate Compliance'}
                </Button>
                <Button
                  variant="outlined"
                  startIcon={exportingPDF ? <CircularProgress size={16} /> : <PictureAsPdf />}
                  onClick={() => {
                    if (isFeatureAllowed('pdf_reports')) {
                      handleExportPDF();
                    } else {
                      setUpgradePrompt({ open: true, feature: 'PDF Reports', description: 'Generate audit-ready PDF compliance reports with scores, gaps, and recommendations.' });
                    }
                  }}
                  disabled={exportingPDF || (!state.evaluation && isFeatureAllowed('pdf_reports'))}
                  title={!state.evaluation ? 'Run an evaluation first' : 'Export PDF report'}
                >
                  {exportingPDF ? 'Exporting...' : 'Export PDF'}
                </Button>
              </>
            )}
            <Button
              variant="contained"
              startIcon={<CloudUpload />}
              onClick={handleCollectEvidence}
              disabled={collectingEvidence}
            >
              {collectingEvidence ? 'Collecting...' : 'Collect Evidence'}
            </Button>
          </Box>
        </Box>
      </Box>

      {/* Error Alert */}
      {state.error && (
        <Alert
          severity="error"
          sx={{ mb: 3 }}
          action={
            <Button color="inherit" size="small" onClick={fetchDashboardData}>
              Retry
            </Button>
          }
        >
          {state.error}
        </Alert>
      )}

      {/* Main Dashboard Grid */}
      <Box sx={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
        {/* Top Row - Compliance Score and Summary */}
        <Box sx={{ display: { xs: 'flex', lg: 'flex' }, flexDirection: { xs: 'column', lg: 'row' }, gap: 3 }}>
          <Box sx={{ flex: 1 }}>
            <ComplianceScore
              metrics={state.summary?.compliance_metrics || {
                s3_encryption_compliance: 0,
                iam_policy_compliance: 0,
                overall_compliance_score: 0
              }}
              evaluation={state.evaluation}
              loading={state.loading}
            />
          </Box>

          <Box sx={{ flex: 1 }}>
            <Paper sx={{ p: 3, height: '100%', minHeight: 400 }}>
              <Typography variant="h6" gutterBottom>
                {isElectron ? 'Local Collection Summary' : 'Collection Summary'}
              </Typography>
              {state.summary ? (
                <Box sx={{ mt: 2 }}>
                  <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 2 }}>
                    <Box sx={{ textAlign: 'center' }}>
                      <Typography variant="h4" sx={{ color: 'primary.main', fontWeight: 'bold' }}>
                        {state.summary.total_collections}
                      </Typography>
                      <Typography variant="body2" color="text.secondary">
                        Total Evidence Items
                      </Typography>
                    </Box>
                    <Box sx={{ textAlign: 'center' }}>
                      <Typography variant="h4" sx={{ color: 'success.main', fontWeight: 'bold' }}>
                        {state.evaluation?.compliant_controls || 0}
                      </Typography>
                      <Typography variant="body2" color="text.secondary">
                        Compliant Controls
                      </Typography>
                    </Box>
                    <Box sx={{ textAlign: 'center' }}>
                      <Typography variant="h4" sx={{ color: 'warning.main', fontWeight: 'bold' }}>
                        {state.evaluation?.partial_controls || 0}
                      </Typography>
                      <Typography variant="body2" color="text.secondary">
                        Partial Controls
                      </Typography>
                    </Box>
                    <Box sx={{ textAlign: 'center' }}>
                      <Typography variant="h4" sx={{ color: 'error.main', fontWeight: 'bold' }}>
                        {state.evaluation?.non_compliant_controls || 0}
                      </Typography>
                      <Typography variant="body2" color="text.secondary">
                        Non-Compliant
                      </Typography>
                    </Box>
                  </Box>

                  {state.summary.last_collection && (
                    <Box sx={{ mt: 3, pt: 2, borderTop: 1, borderColor: 'divider' }}>
                      <Typography variant="body2" color="text.secondary">
                        Last Collection: {new Date(state.summary.last_collection).toLocaleDateString()}
                      </Typography>
                    </Box>
                  )}

                  {state.evaluation && (
                    <Box sx={{ mt: 2, pt: 2, borderTop: 1, borderColor: 'divider' }}>
                      <Typography variant="body2" color="text.secondary">
                        Total Controls: {state.evaluation.total_controls} |
                        Not Assessed: {state.evaluation.not_assessed_controls}
                      </Typography>
                    </Box>
                  )}
                </Box>
              ) : (
                <Box sx={{ display: 'flex', justifyContent: 'center', mt: 4 }}>
                  <CircularProgress />
                </Box>
              )}
            </Paper>
          </Box>
        </Box>

        {/* Evidence List */}
        <Box>
          <EvidenceList
            evidenceItems={state.evidenceItems}
            loading={state.loading}
            onItemClick={handleEvidenceItemClick}
          />
        </Box>
      </Box>

      {/* Evidence Upload Dialog */}
      {isElectron && (
        <EvidenceUpload
          open={uploadDialogOpen}
          onClose={() => setUploadDialogOpen(false)}
          onSuccess={() => {
            setState(prev => ({
              ...prev,
              successMessage: 'Evidence uploaded successfully!'
            }));
            fetchDashboardData();
          }}
        />
      )}

      {/* Upgrade Prompt */}
      <UpgradePrompt
        feature={upgradePrompt.feature}
        description={upgradePrompt.description}
        open={upgradePrompt.open}
        onClose={() => setUpgradePrompt(prev => ({ ...prev, open: false }))}
        onGoToSettings={() => onNavigate?.('settings')}
      />

      {/* Snackbar for notifications */}
      <Snackbar
        open={!!state.successMessage}
        autoHideDuration={6000}
        onClose={handleCloseSnackbar}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
      >
        <Alert onClose={handleCloseSnackbar} severity="success">
          {state.successMessage}
        </Alert>
      </Snackbar>
    </Container>
  );
};

export default Dashboard;
