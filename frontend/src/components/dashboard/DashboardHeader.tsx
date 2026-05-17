import React from 'react';
import { Box, Button, ButtonGroup, CircularProgress, Typography } from '@mui/material';
import MotionButton from '../ui/MotionButton';
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
          <Typography variant="h4" component="h1" gutterBottom>
            Dashboard
          </Typography>
          <Typography variant="body1" color="text.secondary">
            Monitor your compliance status across SOC 2, ISO 27001 and HIPAA
          </Typography>
        </Box>

        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, flexWrap: 'wrap' }}>
          <Button
            variant="text"
            color="inherit"
            startIcon={<Refresh />}
            onClick={onRefresh}
            disabled={loading}
            sx={{ color: 'text.secondary' }}
          >
            Refresh
          </Button>

          {isElectron && (
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
              <ButtonGroup variant="outlined" size="small" color="inherit">
                <Button
                  startIcon={<Upload />}
                  onClick={() =>
                    isFeatureAllowed('evidence_upload')
                      ? onUploadClick()
                      : onUpgradePrompt('Upload Evidence', 'Manually upload policy documents, screenshots, and compliance evidence mapped to SOC 2 controls.')
                  }
                  sx={{ minWidth: 130, color: 'text.primary' }}
                >
                  Upload Evidence
                </Button>
                <Button
                  startIcon={evaluating ? <CircularProgress size={14} /> : <Assessment />}
                  onClick={onEvaluate}
                  disabled={evaluating}
                  sx={{ minWidth: 160, color: 'text.primary' }}
                >
                  {evaluating ? 'Evaluating...' : 'Evaluate Compliance'}
                </Button>
                <Button
                  startIcon={exportingPDF ? <CircularProgress size={14} /> : <PictureAsPdf />}
                  onClick={() =>
                    isFeatureAllowed('pdf_reports')
                      ? onExportPDF()
                      : onUpgradePrompt('PDF Reports', 'Generate audit-ready PDF compliance reports with scores, gaps, and recommendations.')
                  }
                  disabled={exportingPDF || (!evaluation && isFeatureAllowed('pdf_reports'))}
                  sx={{ minWidth: 110, color: 'text.primary' }}
                >
                  {exportingPDF ? 'Exporting...' : 'Export PDF'}
                </Button>
              </ButtonGroup>

              {cloudConnected && (
                <Button
                  variant="outlined"
                  size="small"
                  color="inherit"
                  startIcon={syncingCloud ? <CircularProgress size={14} /> : <CloudSyncIcon />}
                  onClick={onSyncCloud}
                  disabled={syncingCloud}
                  sx={{ color: 'text.primary', borderColor: 'divider' }}
                >
                  {syncingCloud ? 'Syncing...' : 'Sync'}
                </Button>
              )}
            </Box>
          )}

          <MotionButton variant="contained" startIcon={<CloudUpload />} onClick={onCollect} disabled={collectingEvidence}>
            {collectingEvidence ? 'Collecting...' : 'Collect Evidence'}
          </MotionButton>
        </Box>
      </Box>
    </Box>
  );
};

export default DashboardHeader;
