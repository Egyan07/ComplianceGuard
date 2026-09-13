import React, { useState } from 'react';
import {
  AppBar, Box, Chip, Divider, IconButton, ListItemIcon, Menu, MenuItem, Toolbar, Tooltip, Typography,
} from '@mui/material';
import { DarkMode, LightMode, Logout } from '@mui/icons-material';
import StatusChip from '../ui/StatusChip';
import { Tone } from '../../theme';
import { useLicense } from '../../contexts/LicenseContext';
import { isElectronMode } from '../../services/electron';
import { useAuth } from '../../contexts/AuthContext';
import { VERSION } from '../../constants';

interface TopbarProps {
  mode: 'light' | 'dark';
  onToggleMode: () => void;
}

const TIER_TONE: Record<string, Tone> = {
  enterprise: 'info',
  pro: 'success',
  free: 'neutral',
};

const Topbar: React.FC<TopbarProps> = ({ mode = 'light', onToggleMode }) => {
  const { tier } = useLicense();
  const { user, logout } = useAuth();
  const isElectron = isElectronMode();
  const [accountAnchor, setAccountAnchor] = useState<null | HTMLElement>(null);

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
            width: 28,
            height: 28,
            borderRadius: '7px',
            backgroundColor: 'primary.main',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            flexShrink: 0,
          }}
        >
          <Typography sx={{ color: '#fff', fontWeight: 700, fontSize: '0.7rem', letterSpacing: '-0.5px' }}>
            CG
          </Typography>
        </Box>

        <Typography
          sx={{
            fontWeight: 700,
            fontSize: '0.85rem',
            letterSpacing: '-0.3px',
            color: 'text.primary',
          }}
        >
          ComplianceGuard
        </Typography>

        <Chip
          label={`v${VERSION}`}
          size="small"
          sx={{
            height: 18,
            fontSize: '0.66rem',
            fontWeight: 600,
            color: 'text.secondary',
            bgcolor: 'transparent',
            border: '1px solid',
            borderColor: 'divider',
          }}
        />

        <Box sx={{ flex: 1 }} />

        <Tooltip title={mode === 'light' ? 'Switch to dark mode' : 'Switch to light mode'}>
          <IconButton
            size="small"
            onClick={onToggleMode}
            aria-label={mode === 'light' ? 'Switch to dark mode' : 'Switch to light mode'}
            sx={{ color: 'text.secondary' }}
          >
            {mode === 'light' ? <DarkMode fontSize="small" /> : <LightMode fontSize="small" />}
          </IconButton>
        </Tooltip>

        <StatusChip
          tone={TIER_TONE[tier] ?? 'neutral'}
          label={tier === 'enterprise' ? 'ENTERPRISE' : tier === 'pro' ? 'PRO' : 'FREE'}
          size="sm"
          sx={{ fontWeight: 700, letterSpacing: '0.6px' }}
        />

        {!isElectron && user && (
          <Tooltip title={`Account (${user.email})`}>
            <IconButton
              size="small"
              onClick={(e) => setAccountAnchor(e.currentTarget)}
              sx={{ p: 0.25 }}
              aria-label="Account menu"
              aria-haspopup="menu"
              aria-expanded={!!accountAnchor}
            >
              <Box
                sx={{
                  width: 26,
                  height: 26,
                  borderRadius: '50%',
                  backgroundColor: 'primary.main',
                  color: '#fff',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <Typography sx={{ fontSize: '0.72rem', fontWeight: 700, lineHeight: 1 }}>
                  {user.email[0].toUpperCase()}
                </Typography>
              </Box>
            </IconButton>
          </Tooltip>
        )}

        {/* Web-mode account menu. Previously the avatar was wired straight to
            logout() with only a hover tooltip saying so — one click silently
            ended the session and bounced the user to the login page, which
            read as a crash. A menu with the identity visible makes the state
            explicit and keeps destructive logout behind a second click. */}
        <Menu
          anchorEl={accountAnchor}
          open={!!accountAnchor}
          onClose={() => setAccountAnchor(null)}
          anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
          transformOrigin={{ vertical: 'top', horizontal: 'right' }}
        >
          <Box sx={{ px: 2, py: 1 }}>
            <Typography sx={{ fontSize: '0.85rem', fontWeight: 600 }}>
              {user?.first_name ? `${user.first_name} ${user.last_name ?? ''}`.trim() : null}
            </Typography>
            <Typography sx={{ fontSize: '0.75rem', color: 'text.secondary' }}>
              {user?.email}
            </Typography>
          </Box>
          <Divider />
          <MenuItem
            onClick={() => { setAccountAnchor(null); logout(); }}
            sx={{ fontSize: '0.85rem' }}
          >
            <ListItemIcon><Logout fontSize="small" /></ListItemIcon>
            Sign out
          </MenuItem>
        </Menu>
      </Toolbar>
    </AppBar>
  );
};

export default Topbar;
