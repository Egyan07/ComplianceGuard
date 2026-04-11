/*
Main Dashboard Component

Integrates ComplianceScore and EvidenceList components with a responsive
grid layout using Material-UI. Handles data fetching and state management.
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
  CloudUpload
} from '@mui/icons-material';
import ComplianceScore from './ComplianceScore';
import EvidenceList from './EvidenceList';
import {
  getEvidenceSummary,
  getMockEvidenceSummary,
  getMockEvidenceItems,
  collectEvidence,
  EvidenceSummary,
  EvidenceItem
} from '../services/api';

interface DashboardState {
  summary: EvidenceSummary | null;
  evidenceItems: EvidenceItem[];
  loading: boolean;
  error: string | null;
  successMessage: string | null;
}

const Dashboard: React.FC = () => {
  const [state, setState] = useState<DashboardState>({
    summary: null,
    evidenceItems: [],
    loading: true,
    error: null,
    successMessage: null
  });

  const [collectingEvidence, setCollectingEvidence] = useState(false);

  const fetchDashboardData = async () => {
    setState(prev => ({ ...prev, loading: true, error: null }));

    try {
      // Try to fetch from real API, fallback to mock data if it fails
      let summary: EvidenceSummary;

      try {
        summary = await getEvidenceSummary();
      } catch (apiError) {
        console.warn('API not available, using mock data:', apiError);
        summary = getMockEvidenceSummary();
      }

      const evidenceItems = getMockEvidenceItems();

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
      // Mock evidence collection request
      const request = {
        collection_types: ['s3_encryption', 'iam_policy']
      };

      await collectEvidence(request);

      setState(prev => ({
        ...prev,
        successMessage: 'Evidence collection initiated successfully!'
      }));

      // Refresh dashboard data after collection
      setTimeout(() => {
        fetchDashboardData();
      }, 2000);

    } catch (error) {
      setState(prev => ({
        ...prev,
        error: 'Failed to collect evidence. Please check your configuration.'
      }));
      console.error('Evidence collection error:', error);
    } finally {
      setCollectingEvidence(false);
    }
  };

  const handleEvidenceItemClick = (item: EvidenceItem) => {
    console.log('Evidence item clicked:', item);
    // In a real implementation, this might open a detailed view
    // or trigger additional actions based on the evidence item
  };

  const handleCloseSnackbar = () => {
    setState(prev => ({ ...prev, error: null, successMessage: null }));
  };

  useEffect(() => {
    fetchDashboardData();
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
              Monitor your SOC 2 compliance status and evidence collection
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

      {/* Error/Success Alerts */}
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
              loading={state.loading}
            />
          </Box>

          <Box sx={{ flex: 1 }}>
            <Paper sx={{ p: 3, height: '100%', minHeight: 400 }}>
              <Typography variant="h6" gutterBottom>
                Collection Summary
              </Typography>
              {state.summary ? (
                <Box sx={{ mt: 2 }}>
                  <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 2 }}>
                    <Box sx={{ textAlign: 'center' }}>
                      <Typography variant="h4" sx={{ color: 'primary.main', fontWeight: 'bold' }}>
                        {state.summary.total_collections}
                      </Typography>
                      <Typography variant="body2" color="text.secondary">
                        Total Collections
                      </Typography>
                    </Box>
                    <Box sx={{ textAlign: 'center' }}>
                      <Typography variant="h4" sx={{ color: 'success.main', fontWeight: 'bold' }}>
                        {state.evidenceItems.filter(item => item.status === 'compliant').length}
                      </Typography>
                      <Typography variant="body2" color="text.secondary">
                        Compliant Items
                      </Typography>
                    </Box>
                    <Box sx={{ textAlign: 'center' }}>
                      <Typography variant="h4" sx={{ color: 'warning.main', fontWeight: 'bold' }}>
                        {state.evidenceItems.filter(item => item.status === 'warning').length}
                      </Typography>
                      <Typography variant="body2" color="text.secondary">
                        Warnings
                      </Typography>
                    </Box>
                    <Box sx={{ textAlign: 'center' }}>
                      <Typography variant="h4" sx={{ color: 'error.main', fontWeight: 'bold' }}>
                        {state.evidenceItems.filter(item =>
                          item.status === 'non_compliant' || item.status === 'non-compliant'
                        ).length}
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
