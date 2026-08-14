import React from 'react';
import { AppBar, Box, Chip, IconButton, Toolbar, Tooltip, Typography } from '@mui/material';
import { DarkMode, LightMode } from '@mui/icons-material';
import { motion } from 'framer-motion';
import { useLicense } from '../../contexts/LicenseContext';
import { isElectronMode } from '../../services/electron';
import { useAuth } from '../../contexts/AuthContext';
import { VERSION } from '../../constants';

interface TopbarProps {
  mode: 'light' | 'dark';
  onToggleMode: () => void;
}


const Topbar: React.FC<TopbarProps> = ({ mode, onToggleMode }) => {
  const { tier } = useLicense();
  const { user, logout } = useAuth();
  const isElectron = isElectronMode();

  return (
    <AppBar
      position="sticky"
      elevation={0}
      sx={{
        height: 44,
        backgroundColor: mode === 'light' ? 'rgba(255,255,255,0.85)' : 'rgba(15,17,23,0.92)',
        backdropFilter: 'blur(12px)',
        borderBottom: '1px solid',
        borderColor: 'divider',
        boxShadow: mode === 'light' ? '0 1px 0 rgba(15,23,42,0.06)' : '0 1px 0 rgba(0,0,0,0.3)',
        color: 'text.primary',
        zIndex: 100,
      }}
    >
      <Toolbar variant="dense" sx={{ minHeight: 44, px: 2, gap: 1 }}>
        <Box
          sx={{
            width: 28, height: 28, borderRadius: '7px',
            background: 'linear-gradient(145deg, #2563EB 0%, #1E40AF 100%)',
            boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.18), 0 1px 3px rgba(37,99,235,0.4)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            flexShrink: 0,
          }}
        >
          <Typography sx={{ color: '#fff', fontWeight: 700, fontSize: '0.7rem', letterSpacing: '-0.5px' }}>
            CG
          </Typography>
        </Box>

        <Typography sx={{ fontWeight: 700, fontSize: '0.85rem', letterSpacing: '-0.4px', color: 'text.primary' }}>
          ComplianceGuard
        </Typography>

        <Box sx={{ opacity: 0.45 }}>
          <Chip
            label={`v${VERSION}`}
            size="small"
            sx={{ height: 16, fontSize: '0.6rem', color: 'text.disabled', bgcolor: 'transparent', border: '1px solid', borderColor: 'divider' }}
          />
        </Box>

        <Box sx={{ flex: 1 }} />

        <Tooltip title={mode === 'light' ? 'Switch to dark mode' : 'Switch to light mode'}>
          <IconButton
            size="small"
            onClick={onToggleMode}
            aria-label={mode === 'light' ? 'Switch to dark mode' : 'Switch to light mode'}
            sx={{ color: 'text.secondary' }}
          >
            <motion.span
              animate={{ rotate: mode === 'dark' ? 180 : 0 }}
              transition={{ duration: 0.3 }}
              style={{ display: 'flex', alignItems: 'center' }}
            >
              {mode === 'light' ? <DarkMode fontSize="small" /> : <LightMode fontSize="small" />}
            </motion.span>
          </IconButton>
        </Tooltip>

        <motion.div
          animate={{ boxShadow: tier !== 'free' ? ['0 0 0px #10B981', '0 0 8px rgba(16,185,129,0.5)', '0 0 0px #10B981'] : '0 0 0px transparent' }}
          transition={{ duration: 3, repeat: Infinity, ease: 'easeInOut' }}
          style={{ borderRadius: 6 }}
        >
          <Chip
            label={tier === 'enterprise' ? 'ENTERPRISE' : tier === 'pro' ? 'PRO' : 'FREE'}
            size="small"
            sx={{
              height: 20, fontSize: '0.6rem', fontWeight: 700, letterSpacing: '1px',
              backgroundColor: tier === 'enterprise' ? '#EDE9FE' : tier === 'pro' ? '#D1FAE5' : '#EFF6FF',
              color: tier === 'enterprise' ? '#5B21B6' : tier === 'pro' ? '#065F46' : '#2563EB',
            }}
          />
        </motion.div>

        {!isElectron && user && (
          <Tooltip title={`Sign out (${user.email})`}>
            <IconButton size="small" onClick={logout} sx={{ p: 0.25 }}>
              <Box
                sx={{
                  width: 28, height: 28, borderRadius: '50%',
                  background: 'linear-gradient(135deg, #6366F1 0%, #7C3AED 100%)',
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
