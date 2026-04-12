import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  Typography,
  Box,
} from '@mui/material';
import { Lock } from '@mui/icons-material';

interface UpgradePromptProps {
  feature: string;
  description: string;
  open: boolean;
  onClose: () => void;
  onGoToSettings?: () => void;
}

const UpgradePrompt: React.FC<UpgradePromptProps> = ({
  feature,
  description,
  open,
  onClose,
  onGoToSettings,
}) => {
  return (
    <Dialog open={open} onClose={onClose} maxWidth="xs" fullWidth>
      <DialogTitle sx={{ textAlign: 'center', pt: 4 }}>
        <Lock sx={{ fontSize: 48, color: '#2563EB', mb: 1 }} />
        <Typography variant="h6" component="div">
          {feature} — Pro Feature
        </Typography>
      </DialogTitle>
      <DialogContent sx={{ textAlign: 'center' }}>
        <Typography variant="body2" color="text.secondary">
          {description}
        </Typography>
        <Box sx={{ mt: 2, p: 2, backgroundColor: '#EFF6FF', borderRadius: 2 }}>
          <Typography variant="body2" sx={{ color: '#1E40AF', fontWeight: 500 }}>
            Upgrade to Pro to unlock all 29 controls, PDF reports,
            evaluation history, and more.
          </Typography>
        </Box>
      </DialogContent>
      <DialogActions sx={{ justifyContent: 'center', pb: 3, gap: 1 }}>
        <Button onClick={onClose} color="inherit">
          Maybe Later
        </Button>
        <Button
          variant="contained"
          onClick={() => {
            onClose();
            onGoToSettings?.();
          }}
        >
          Enter License Key
        </Button>
      </DialogActions>
    </Dialog>
  );
};

export default UpgradePrompt;
