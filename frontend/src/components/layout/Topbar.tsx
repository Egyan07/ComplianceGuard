import React from 'react';
import { AppBar, Box, Chip, IconButton, Toolbar, Tooltip, Typography } from '@mui/material';
import { DarkMode, LightMode } from '@mui/icons-material';
import { motion } from 'framer-motion';
import { useLicense } from '../../contexts/LicenseContext';
import { useAuth } from '../../contexts/AuthContext';
import { VERSION } from '../../constants';

interface TopbarProps {
  mode: 'light' | 'dark';
  onToggleMode: () => void;
}

const MotionIconButton = motion(IconButton);

const Topbar: React.FC<TopbarProps> = ({ mode, onToggleMode }) => {
  const { tier } = useLicense();
  const { user, logout } = useAuth();
  const isElectron = !!(window as any).electronAPI;

  return (
    <AppBar
      position="sticky"
      elevation={0}
      sx={{
        height: 44,
        backgroundColor: mode === 'light' ? 'rgba(255,255,255,0.85)' : 'rgba(15,17,23,0.85)',
        backdropFilter: 'blur(8px)',
        borderBottom: '1px solid',
        borderColor: 'divider',
        color: 'text.primary',
        zIndex: 100,
      }}
    >
      <Toolbar variant="dense" sx={{ minHeight: 44, px: 2, gap: 1 }}>
        <Box
          sx={{
            width: 28, height: 28, borderRadius: '7px',
            backgroundColor: 'primary.main',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            flexShrink: 0,
          }}
        >
          <Typography sx={{ color: '#fff', fontWeight: 700, fontSize: '0.7rem', letterSpacing: '-0.5px' }}>
            CG
          </Typography>
        </Box>

        <Typography variant="subtitle2" sx={{ fontWeight: 700, color: 'text.primary', letterSpacing: '-0.3px' }}>
          ComplianceGuard
        </Typography>

        <Chip
          label={`v${VERSION}`}
          size="small"
          sx={{ height: 16, fontSize: '0.6rem', color: 'text.disabled', bgcolor: 'transparent', border: '1px solid', borderColor: 'divider' }}
        />

        <Box sx={{ flex: 1 }} />

        <Tooltip title={mode === 'light' ? 'Switch to dark mode' : 'Switch to light mode'}>
          <MotionIconButton
            size="small"
            onClick={onToggleMode}
            aria-label={mode === 'light' ? 'Switch to dark mode' : 'Switch to light mode'}
            animate={{ rotate: mode === 'dark' ? 180 : 0 }}
            transition={{ duration: 0.3 }}
            sx={{ color: 'text.secondary' }}
          >
            {mode === 'light' ? <DarkMode fontSize="small" /> : <LightMode fontSize="small" />}
          </MotionIconButton>
        </Tooltip>

        <Chip
          label={tier === 'pro' ? 'PRO' : 'FREE'}
          size="small"
          sx={{
            height: 20, fontSize: '0.6rem', fontWeight: 700, letterSpacing: '1px',
            backgroundColor: tier === 'pro' ? '#D1FAE5' : '#EFF6FF',
            color: tier === 'pro' ? '#065F46' : '#2563EB',
          }}
        />

        {!isElectron && user && (
          <Tooltip title={`Sign out (${user.email})`}>
            <IconButton size="small" onClick={logout} sx={{ p: 0.25 }}>
              <Box
                sx={{
                  width: 28, height: 28, borderRadius: '50%',
                  backgroundColor: '#6B7280',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}
              >
                <Typography sx={{ color: '#fff', fontSize: '0.65rem', fontWeight: 700 }}>
                  {user.email[0].toUpperCase()}
                </Typography>
              </Box>
            </IconButton>
          </Tooltip>
        )}
      </Toolbar>
    </AppBar>
  );
};

export default Topbar;
