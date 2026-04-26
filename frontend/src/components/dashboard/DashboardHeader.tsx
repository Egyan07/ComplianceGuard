import React from 'react';
import { Box, Button, CircularProgress, Typography } from '@mui/material';
import { Refresh, CloudUpload, Assessment, Upload, PictureAsPdf, CloudSync as CloudSyncIcon } from '@mui/icons-material';
import { useLicense } from '../../contexts/LicenseContext';
import { ComplianceEvaluation } from '../../services/api';

const isElectron = !!(window as any).electronAPI;

interface Props {
  loading: boolean;
  evaluation: ComplianceEvaluation | null;
  collectingEvidence: boolean;
  evaluating: boolean;
  exportingPDF: boolean;
  syncingCloud: boolean;
  cloudConnected: boolean;
  onRefresh: () => void;
  onCollect: () => void;
  onEvaluate: () => void;
  onExportPDF: () => void;
  onSyncCloud: () => void;
  onUploadClick: () => void;
  onUpgradePrompt: (feature: string, description: string) => void;
}

const DashboardHeader: React.FC<Props> = ({
  loading, evaluation, collectingEvidence, evaluating, exportingPDF,
  syncingCloud, cloudConnected, onRefresh, onCollect, onEvaluate,
  onExportPDF, onSyncCloud, onUploadClick, onUpgradePrompt,
}) => {
  const { isFeatureAllowed } = useLicense();

  return (
    <Box sx={{ mb: 4 }}>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2, flexWrap: 'wrap', gap: 2 }}>
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
        <Box sx={{ display: 'flex', gap: 2, flexWrap: 'wrap' }}>
          <Button variant="outlined" startIcon={<Refresh />} onClick={onRefresh} disabled={loading}>
            Refresh
          </Button>
          {isElectron && (
            <>
              <Button
                variant="outlined"
                startIcon={<Upload />}
                onClick={() =>
                  isFeatureAllowed('evidence_upload')
                    ? onUploadClick()
                    : onUpgradePrompt('Upload Evidence', 'Manually upload policy documents, screenshots, and compliance evidence mapped to SOC 2 controls.')
                }
              >
                Upload Evidence
              </Button>
              {cloudConnected && (
                <Button
                  variant="outlined"
                  startIcon={syncingCloud ? <CircularProgress size={16} /> : <CloudSyncIcon />}
                  onClick={onSyncCloud}
                  disabled={syncingCloud}
                >
                  {syncingCloud ? 'Syncing...' : 'Sync to Cloud'}
                </Button>
              )}
              <Button variant="outlined" color="secondary" startIcon={<Assessment />} onClick={onEvaluate} disabled={evaluating}>
                {evaluating ? 'Evaluating...' : 'Evaluate Compliance'}
              </Button>
              <Button
                variant="outlined"
                startIcon={exportingPDF ? <CircularProgress size={16} /> : <PictureAsPdf />}
                onClick={() =>
                  isFeatureAllowed('pdf_reports')
                    ? onExportPDF()
                    : onUpgradePrompt('PDF Reports', 'Generate audit-ready PDF compliance reports with scores, gaps, and recommendations.')
                }
                disabled={exportingPDF || (!evaluation && isFeatureAllowed('pdf_reports'))}
              >
                {exportingPDF ? 'Exporting...' : 'Export PDF'}
              </Button>
            </>
          )}
          <Button variant="contained" startIcon={<CloudUpload />} onClick={onCollect} disabled={collectingEvidence}>
            {collectingEvidence ? 'Collecting...' : 'Collect Evidence'}
          </Button>
        </Box>
      </Box>
    </Box>
  );
};

export default DashboardHeader;
