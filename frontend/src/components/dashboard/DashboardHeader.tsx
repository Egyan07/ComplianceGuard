import React from 'react';
import { Box, Button, ButtonGroup, CircularProgress, Typography } from '@mui/material';
import MotionButton from '../ui/MotionButton';
import PageHeader from '../ui/PageHeader';
import { Refresh, CloudUpload, Assessment, Upload, PictureAsPdf, CloudSync as CloudSyncIcon, Computer as ComputerIcon } from '@mui/icons-material';
import { useLicense } from '../../contexts/LicenseContext';
import { ComplianceEvaluation } from '../../services/api';
import { isElectronMode } from '../../services/electron';

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
  // Call-time (not module import) so the header reflects the real environment.
  const isElectron = isElectronMode();

  return (
    <Box sx={{ mb: 4 }}>
      <PageHeader
        title="Dashboard"
        subtitle="Evidence readiness across SOC 2, ISO 27001, HIPAA and GDPR"
        actions={
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

          {/* Upload + Evaluate work in BOTH modes: web uploads go to the
              backend's POST /evidence/upload and evaluate hits
              evaluate-from-evidence. PDF export, cloud sync and OS evidence
              collection stay desktop-only — a browser tab cannot run the
              OS-level collector or write files to disk. */}
          <ButtonGroup variant="outlined" size="small" color="inherit">
            <Button
              startIcon={<Upload />}
              onClick={() =>
                isFeatureAllowed('evidence_upload')
                  ? onUploadClick()
                  : onUpgradePrompt('Upload Evidence', 'Manually upload policy documents, screenshots, and compliance evidence mapped to your selected framework\u2019s controls.')
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
            {isElectron && (
              <Button
                startIcon={exportingPDF ? <CircularProgress size={14} /> : <PictureAsPdf />}
                onClick={() =>
                  isFeatureAllowed('pdf_reports')
                    ? onExportPDF()
                    : onUpgradePrompt('PDF Reports', 'Generate PDF readiness reports with evidence coverage, gaps, and recommendations.')
                }
                disabled={exportingPDF || (!evaluation && isFeatureAllowed('pdf_reports'))}
                sx={{ minWidth: 110, color: 'text.primary' }}
              >
                {exportingPDF ? 'Exporting...' : 'Export PDF'}
              </Button>
            )}
          </ButtonGroup>

          {isElectron && (
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
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

              <MotionButton variant="contained" startIcon={<CloudUpload />} onClick={onCollect} disabled={collectingEvidence}>
                {collectingEvidence ? 'Collecting...' : 'Collect Evidence'}
              </MotionButton>
            </Box>
          )}
          </Box>
        }
      />

      {/* Web mode: the hidden desktop-only actions (OS collection, PDF export,
          cloud sync) otherwise look like missing features — say where they are. */}
      {!isElectron && (
        <Typography
          variant="body2"
          sx={{ display: 'flex', alignItems: 'center', gap: 0.75, mt: -2, mb: 2, color: 'text.secondary', fontSize: '0.78rem' }}
        >
          <ComputerIcon sx={{ fontSize: '1rem' }} />
          OS-level evidence collection, PDF reports, and cloud sync are available in the desktop app.
        </Typography>
      )}
    </Box>
  );
};

export default DashboardHeader;
