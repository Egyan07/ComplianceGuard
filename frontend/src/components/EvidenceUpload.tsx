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
import { getElectronAPI, isElectronMode } from '../services/electron';
import { getErrorMessage } from '../lib/errors';
import {
  getCategoryForType,
  ManualEvidencePayload,
  SOC2_CONTROLS,
} from './EvidenceUpload.data';

const isElectron = isElectronMode();

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
      const api = getElectronAPI();
      const file = await api.selectEvidenceFile();
      if (file) {
        setSelectedFile(file);
        if (!title) {
          setTitle(file.fileName);
        }
      }
    } catch (err) {
      setError('Failed to select file: ' + getErrorMessage(err));
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
      const api = getElectronAPI();

      let evidenceData: ManualEvidencePayload;

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
    } catch (err) {
      setError(getErrorMessage(err, 'Failed to upload evidence.'));
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

export default EvidenceUpload;
