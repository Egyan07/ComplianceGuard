/*
Evidence Upload Component

Dialog form for manually uploading compliance evidence (documents, text)
and mapping it to a specific SOC 2 control.
*/

import React, { useState } from 'react';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  TextField,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  Box,
  Typography,
  Chip,
  Alert,
  CircularProgress,
  Paper,
  SelectChangeEvent
} from '@mui/material';
import {
  CloudUpload,
  Description,
  InsertDriveFile,
  Close
} from '@mui/icons-material';

const isElectron = !!(window as any).electronAPI;

// SOC 2 controls for the dropdown (matches the 54-control framework)
const SOC2_CONTROLS = [
  { id: 'CC1.1', title: 'CC1.1 - Control Environment', types: ['policy_document', 'training_records', 'code_of_conduct', 'security_policies'] },
  { id: 'CC1.2', title: 'CC1.2 - Board Independence', types: ['governance_documents', 'board_charter', 'meeting_minutes'] },
  { id: 'CC1.3', title: 'CC1.3 - Management Philosophy', types: ['competency_framework', 'training_records', 'security_policies'] },
  { id: 'CC2.1', title: 'CC2.1 - Communication and Information', types: ['communication_policies', 'training_materials', 'internal_memos'] },
  { id: 'CC2.2', title: 'CC2.2 - Information Quality', types: ['information_system_docs', 'data_flow_diagrams', 'process_maps'] },
  { id: 'CC2.3', title: 'CC2.3 - External Communication', types: ['external_communication_policy', 'nda_agreements', 'incident_notifications'] },
  { id: 'CC3.1', title: 'CC3.1 - Risk Assessment Process', types: ['risk_assessment', 'business_objectives', 'compliance_framework'] },
  { id: 'CC3.2', title: 'CC3.2 - Risk Identification', types: ['risk_register', 'threat_modeling', 'compliance_checklists'] },
  { id: 'CC3.3', title: 'CC3.3 - Risk Analysis', types: ['risk_analysis_reports', 'impact_assessments', 'risk_register'] },
  { id: 'CC4.1', title: 'CC4.1 - Monitoring Activities', types: ['audit_reports', 'monitoring_logs', 'compliance_checklists'] },
  { id: 'CC4.2', title: 'CC4.2 - Separate Evaluations', types: ['internal_audit_reports', 'assessment_results', 'remediation_records'] },
  { id: 'CC5.1', title: 'CC5.1 - Control Activities', types: ['control_procedures', 'workflow_documentation', 'process_maps'] },
  { id: 'CC5.2', title: 'CC5.2 - Control Activities Development', types: ['risk_control_matrix', 'control_design_docs', 'process_maps'] },
  { id: 'CC6.1', title: 'CC6.1 - Logical Access Controls', types: ['access_logs', 'user_accounts', 'system_configs', 'network_configs'] },
  { id: 'CC6.2', title: 'CC6.2 - Authentication', types: ['user_provisioning', 'access_requests', 'identity_management'] },
  { id: 'CC6.3', title: 'CC6.3 - Authorization', types: ['role_definitions', 'access_matrices', 'authorization_policies'] },
  { id: 'CC7.1', title: 'CC7.1 - System Operations', types: ['event_logs', 'monitoring_tools', 'incident_reports'] },
  { id: 'CC8.1', title: 'CC8.1 - Change Management', types: ['change_requests', 'deployment_logs', 'approval_records'] },
  { id: 'CC9.1', title: 'CC9.1 - Risk Mitigation', types: ['risk_register', 'mitigation_plans', 'insurance_documents'] },
  // Availability
  { id: 'A1.1', title: 'A1.1 - Availability Policies and Procedures', types: ['uptime_logs', 'backup_logs', 'incident_reports', 'capacity_plans'] },
  { id: 'A1.2', title: 'A1.2 - Capacity Management', types: ['capacity_reports', 'performance_logs', 'resource_monitoring'] },
  { id: 'A1.3', title: 'A1.3 - Backup and Recovery', types: ['backup_logs', 'recovery_plans', 'test_results'] },
  { id: 'A1.4', title: 'A1.4 - Incident Response', types: ['incident_response_plan', 'incident_reports', 'escalation_procedures'] },
  { id: 'A1.5', title: 'A1.5 - System Performance Monitoring', types: ['performance_reports', 'monitoring_logs', 'resource_monitoring'] },
  { id: 'A2.1', title: 'A2.1 - Environmental Controls', types: ['environmental_logs', 'facility_docs', 'disaster_recovery'] },
  { id: 'A2.2', title: 'A2.2 - Facility Access', types: ['access_logs', 'visitor_logs', 'security_badges'] },
  { id: 'A3.1', title: 'A3.1 - Network Security', types: ['network_security_policy', 'firewall_configs', 'network_diagrams'] },
  { id: 'A3.2', title: 'A3.2 - Firewall Management', types: ['firewall_configs', 'firewall_reviews', 'network_diagrams'] },
  // Confidentiality
  { id: 'C1.1', title: 'C1.1 - Confidentiality Policies', types: ['confidentiality_policy', 'access_controls', 'handling_procedures'] },
  { id: 'C1.2', title: 'C1.2 - Data Classification', types: ['data_classification_policy', 'data_inventory', 'handling_procedures'] },
  { id: 'C1.3', title: 'C1.3 - Encryption Controls', types: ['encryption_policies', 'key_management', 'dlp_configuration'] },
  { id: 'C1.4', title: 'C1.4 - Data Masking', types: ['masking_procedures', 'data_inventory', 'access_controls'] },
  { id: 'C2.1', title: 'C2.1 - Confidentiality Agreements', types: ['nda_agreements', 'confidentiality_agreements', 'third_party_agreements'] },
  { id: 'C2.2', title: 'C2.2 - Data Retention', types: ['data_retention_policy', 'retention_schedules', 'data_inventory'] },
  { id: 'C2.3', title: 'C2.3 - Data Disposal', types: ['data_retention_policy', 'disposal_procedures', 'disposal_records'] },
  { id: 'C3.1', title: 'C3.1 - Third Party Confidentiality', types: ['third_party_agreements', 'vendor_assessments', 'nda_agreements'] },
  { id: 'C3.2', title: 'C3.2 - Confidentiality Monitoring', types: ['access_logs', 'monitoring_reports', 'compliance_checklists'] },
  // Processing Integrity
  { id: 'PI1.1', title: 'PI1.1 - Processing Integrity Controls', types: ['processing_procedures', 'quality_controls', 'validation_rules'] },
  { id: 'PI1.2', title: 'PI1.2 - Quality Assurance', types: ['qa_test_results', 'test_reports', 'quality_controls'] },
  { id: 'PI1.3', title: 'PI1.3 - Input Validation', types: ['input_validation', 'data_quality_checks', 'error_handling'] },
  { id: 'PI1.4', title: 'PI1.4 - Processing Controls', types: ['processing_procedures', 'validation_rules', 'process_maps'] },
  { id: 'PI1.5', title: 'PI1.5 - Output Validation', types: ['output_validation', 'reconciliation_reports', 'review_procedures'] },
  { id: 'PI2.1', title: 'PI2.1 - Error Handling', types: ['error_logs', 'monitoring_alerts', 'correction_procedures'] },
  { id: 'PI2.2', title: 'PI2.2 - Transaction Integrity', types: ['transaction_logs', 'reconciliation_reports', 'processing_procedures'] },
  { id: 'PI3.1', title: 'PI3.1 - Processing Monitoring', types: ['monitoring_reports', 'performance_logs', 'compliance_checklists'] },
  { id: 'PI3.2', title: 'PI3.2 - Exception Reporting', types: ['exception_reports', 'error_logs', 'correction_procedures'] },
  // Confidentiality & Availability
  { id: 'CA1.1', title: 'CA1.1 - Confidentiality and Availability Management', types: ['integrated_security_plan', 'security_policies', 'risk_assessment'] },
  { id: 'CA1.2', title: 'CA1.2 - Incident Response', types: ['incident_response_plan', 'incident_reports', 'escalation_procedures'] },
  { id: 'CA1.3', title: 'CA1.3 - Security Awareness Training', types: ['training_records', 'training_materials', 'security_policies'] },
  { id: 'CA1.4', title: 'CA1.4 - Physical Security', types: ['physical_security_policy', 'facility_docs', 'visitor_logs'] },
  { id: 'CA1.5', title: 'CA1.5 - Vendor Management', types: ['vendor_assessments', 'third_party_agreements', 'vendor_register'] },
  { id: 'CA1.6', title: 'CA1.6 - Change Management', types: ['change_requests', 'deployment_logs', 'approval_records'] },
  { id: 'CA1.7', title: 'CA1.7 - Business Continuity', types: ['business_continuity_plan', 'disaster_recovery', 'test_results'] },
  { id: 'CA1.8', title: 'CA1.8 - Security Monitoring', types: ['security_monitoring_logs', 'monitoring_alerts', 'incident_reports'] },
];

interface EvidenceUploadProps {
  open: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

interface SelectedFile {
  fileName: string;
  fileSize: number;
  fileData: string; // base64
}

const EvidenceUpload: React.FC<EvidenceUploadProps> = ({ open, onClose, onSuccess }) => {
  const [controlId, setControlId] = useState('');
  const [evidenceType, setEvidenceType] = useState('');
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [textContent, setTextContent] = useState('');
  const [selectedFile, setSelectedFile] = useState<SelectedFile | null>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [uploadMode, setUploadMode] = useState<'file' | 'text'>('file');

  const selectedControl = SOC2_CONTROLS.find(c => c.id === controlId);
  const availableTypes = selectedControl?.types || [];

  const resetForm = () => {
    setControlId('');
    setEvidenceType('');
    setTitle('');
    setDescription('');
    setTextContent('');
    setSelectedFile(null);
    setError(null);
    setUploadMode('file');
  };

  const handleClose = () => {
    resetForm();
    onClose();
  };

  const handleSelectFile = async () => {
    if (!isElectron) return;

    try {
      const api = (window as any).electronAPI;
      const file = await api.selectEvidenceFile();
      if (file) {
        setSelectedFile(file);
        if (!title) {
          setTitle(file.fileName);
        }
      }
    } catch (err: any) {
      setError('Failed to select file: ' + err.message);
    }
  };

  const handleSubmit = async () => {
    if (!controlId || !evidenceType || !title) {
      setError('Please fill in all required fields (Control, Evidence Type, Title).');
      return;
    }

    if (uploadMode === 'file' && !selectedFile) {
      setError('Please select a file to upload.');
      return;
    }

    if (uploadMode === 'text' && !textContent.trim()) {
      setError('Please enter evidence content.');
      return;
    }

    setUploading(true);
    setError(null);

    try {
      const api = (window as any).electronAPI;

      let evidenceData: any;

      if (uploadMode === 'file' && selectedFile) {
        // Convert base64 back to buffer data for the main process
        evidenceData = {
          controlId,
          evidenceType,
          title,
          description,
          fileName: selectedFile.fileName,
          file: { buffer: Array.from(atob(selectedFile.fileData), c => c.charCodeAt(0)) },
          category: getCategoryForType(evidenceType)
        };
      } else {
        evidenceData = {
          controlId,
          evidenceType,
          title,
          description,
          content: textContent,
          contentType: 'text'
        };
      }

      const result = await api.processManualEvidence(evidenceData, 1);

      if (result.error) {
        setError(result.error);
      } else {
        handleClose();
        onSuccess();
      }
    } catch (err: any) {
      setError(err.message || 'Failed to upload evidence.');
    } finally {
      setUploading(false);
    }
  };

  const formatFileSize = (bytes: number) => {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
  };

  return (
    <Dialog open={open} onClose={handleClose} maxWidth="sm" fullWidth>
      <DialogTitle sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <CloudUpload color="primary" />
          <Typography variant="h6">Upload Evidence</Typography>
        </Box>
        <Button onClick={handleClose} size="small" sx={{ minWidth: 'auto' }}>
          <Close />
        </Button>
      </DialogTitle>

      <DialogContent dividers>
        {error && (
          <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError(null)}>
            {error}
          </Alert>
        )}

        {/* SOC 2 Control Selection */}
        <FormControl fullWidth sx={{ mb: 2 }}>
          <InputLabel>SOC 2 Control *</InputLabel>
          <Select
            value={controlId}
            onChange={(e: SelectChangeEvent) => {
              setControlId(e.target.value);
              setEvidenceType('');
            }}
            label="SOC 2 Control *"
          >
            {SOC2_CONTROLS.map(control => (
              <MenuItem key={control.id} value={control.id}>
                {control.title}
              </MenuItem>
            ))}
          </Select>
        </FormControl>

        {/* Evidence Type Selection */}
        <FormControl fullWidth sx={{ mb: 2 }} disabled={!controlId}>
          <InputLabel>Evidence Type *</InputLabel>
          <Select
            value={evidenceType}
            onChange={(e: SelectChangeEvent) => setEvidenceType(e.target.value)}
            label="Evidence Type *"
          >
            {availableTypes.map(type => (
              <MenuItem key={type} value={type}>
                {type.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase())}
              </MenuItem>
            ))}
          </Select>
        </FormControl>

        {/* Title */}
        <TextField
          fullWidth
          label="Title *"
          value={title}
          onChange={e => setTitle(e.target.value)}
          sx={{ mb: 2 }}
          placeholder="e.g., Q1 2026 Security Policy Document"
        />

        {/* Description */}
        <TextField
          fullWidth
          label="Description"
          value={description}
          onChange={e => setDescription(e.target.value)}
          sx={{ mb: 2 }}
          multiline
          rows={2}
          placeholder="Brief description of this evidence"
        />

        {/* Upload Mode Toggle */}
        <Box sx={{ display: 'flex', gap: 1, mb: 2 }}>
          <Chip
            icon={<InsertDriveFile />}
            label="Upload File"
            onClick={() => setUploadMode('file')}
            color={uploadMode === 'file' ? 'primary' : 'default'}
            variant={uploadMode === 'file' ? 'filled' : 'outlined'}
          />
          <Chip
            icon={<Description />}
            label="Enter Text"
            onClick={() => setUploadMode('text')}
            color={uploadMode === 'text' ? 'primary' : 'default'}
            variant={uploadMode === 'text' ? 'filled' : 'outlined'}
          />
        </Box>

        {/* File Upload */}
        {uploadMode === 'file' && (
          <Box>
            {isElectron ? (
              <Paper
                variant="outlined"
                sx={{
                  p: 3,
                  textAlign: 'center',
                  cursor: 'pointer',
                  '&:hover': { backgroundColor: 'action.hover' },
                  borderStyle: 'dashed'
                }}
                onClick={handleSelectFile}
              >
                {selectedFile ? (
                  <Box>
                    <InsertDriveFile color="primary" sx={{ fontSize: 40, mb: 1 }} />
                    <Typography variant="subtitle2">{selectedFile.fileName}</Typography>
                    <Typography variant="body2" color="text.secondary">
                      {formatFileSize(selectedFile.fileSize)}
                    </Typography>
                    <Typography variant="caption" color="primary" sx={{ mt: 1, display: 'block' }}>
                      Click to change file
                    </Typography>
                  </Box>
                ) : (
                  <Box>
                    <CloudUpload color="action" sx={{ fontSize: 40, mb: 1 }} />
                    <Typography variant="body1" color="text.secondary">
                      Click to select a file
                    </Typography>
                    <Typography variant="caption" color="text.secondary">
                      PDF, DOC, DOCX, TXT, CSV, JSON, XLSX, PNG, JPG
                    </Typography>
                  </Box>
                )}
              </Paper>
            ) : (
              <Alert severity="info">
                File upload requires the desktop application.
              </Alert>
            )}
          </Box>
        )}

        {/* Text Content */}
        {uploadMode === 'text' && (
          <TextField
            fullWidth
            label="Evidence Content"
            value={textContent}
            onChange={e => setTextContent(e.target.value)}
            multiline
            rows={6}
            placeholder="Paste or type evidence content here (e.g., policy text, configuration output, meeting notes)"
          />
        )}
      </DialogContent>

      <DialogActions sx={{ px: 3, py: 2 }}>
        <Button onClick={handleClose} disabled={uploading}>
          Cancel
        </Button>
        <Button
          variant="contained"
          onClick={handleSubmit}
          disabled={uploading || !controlId || !evidenceType || !title}
          startIcon={uploading ? <CircularProgress size={16} /> : <CloudUpload />}
        >
          {uploading ? 'Uploading...' : 'Upload Evidence'}
        </Button>
      </DialogActions>
    </Dialog>
  );
};

function getCategoryForType(evidenceType: string): string {
  const categoryMap: Record<string, string> = {
    policy_document: 'Documents',
    training_records: 'Documents',
    code_of_conduct: 'Documents',
    security_policies: 'SecurityPolicies',
    governance_documents: 'Documents',
    board_charter: 'Documents',
    meeting_minutes: 'Documents',
    risk_assessment: 'Documents',
    audit_reports: 'Documents',
    vulnerability_scans: 'SecurityPolicies',
    firewall_configs: 'ConfigFiles',
    network_configs: 'NetworkConfigs',
    system_configs: 'ConfigFiles',
    event_logs: 'SystemLogs',
    backup_logs: 'SystemLogs',
    access_logs: 'SystemLogs',
  };
  return categoryMap[evidenceType] || 'Documents';
}

export default EvidenceUpload;
