/*
ComplianceGuard SOC 2 Platform - Main Application Component

Root component with Material-UI theming and navigation between
Dashboard and Settings views.
*/

import { useState } from 'react';
import {
  ThemeProvider,
  createTheme,
  CssBaseline,
  Box,
  AppBar,
  Toolbar,
  Typography,
  Container,
  Paper,
  IconButton,
  Tooltip,
  Chip
} from '@mui/material';
import {
  Dashboard as DashboardIcon,
  Settings as SettingsIcon,
  Shield
} from '@mui/icons-material';
import Dashboard from './components/Dashboard';
import Settings from './components/Settings';

type Page = 'dashboard' | 'settings';

const theme = createTheme({
  palette: {
    primary: {
      main: '#0091EA',
      dark: '#1A237E',
      light: '#00E5FF',
    },
    secondary: {
      main: '#00E5FF',
    },
    background: {
      default: '#F5F7FA',
    },
  },
  typography: {
    fontFamily: '"Segoe UI", "Roboto", "Helvetica", "Arial", sans-serif',
    h4: {
      fontWeight: 600,
    },
    h6: {
      fontWeight: 500,
    },
  },
  components: {
    MuiCard: {
      styleOverrides: {
        root: {
          boxShadow: '0 2px 8px rgba(0,0,0,0.08)',
          borderRadius: 8,
        },
      },
    },
    MuiButton: {
      styleOverrides: {
        root: {
          textTransform: 'none',
          borderRadius: 8,
        },
      },
    },
    MuiChip: {
      styleOverrides: {
        root: {
          borderRadius: 6,
        },
      },
    },
    MuiPaper: {
      styleOverrides: {
        root: {
          borderRadius: 8,
        },
      },
    },
  },
});

function App() {
  const [currentPage, setCurrentPage] = useState<Page>('dashboard');

  return (
    <ThemeProvider theme={theme}>
      <CssBaseline />
      <Box sx={{ flexGrow: 1, minHeight: '100vh', display: 'flex', flexDirection: 'column' }}>
        {/* App Bar */}
        <AppBar position="static" elevation={0} sx={{ background: 'linear-gradient(135deg, #0A0E1A 0%, #0D1B2A 50%, #0A1628 100%)' }}>
          <Toolbar>
            <Shield sx={{ mr: 1.5, fontSize: 28, color: '#00E5FF' }} />
            <Typography variant="h6" component="div" sx={{ fontWeight: 'bold', letterSpacing: '-0.5px' }}>
              ComplianceGuard
            </Typography>
            <Chip
              label="BETA"
              size="small"
              sx={{
                ml: 1.5,
                height: 20,
                fontSize: '0.65rem',
                fontWeight: 600,
                backgroundColor: 'rgba(255,255,255,0.15)',
                color: 'rgba(255,255,255,0.9)',
                letterSpacing: '1px'
              }}
            />

            <Box sx={{ flexGrow: 1 }} />

            {/* Navigation */}
            <Tooltip title="Dashboard">
              <IconButton
                color="inherit"
                onClick={() => setCurrentPage('dashboard')}
                sx={{
                  backgroundColor: currentPage === 'dashboard' ? 'rgba(255,255,255,0.15)' : 'transparent',
                  mr: 0.5
                }}
              >
                <DashboardIcon />
              </IconButton>
            </Tooltip>
            <Tooltip title="Settings">
              <IconButton
                color="inherit"
                onClick={() => setCurrentPage('settings')}
                sx={{
                  backgroundColor: currentPage === 'settings' ? 'rgba(255,255,255,0.15)' : 'transparent'
                }}
              >
                <SettingsIcon />
              </IconButton>
            </Tooltip>
          </Toolbar>
        </AppBar>

        {/* Main Content */}
        <Box component="main" sx={{ flexGrow: 1, backgroundColor: 'background.default' }}>
          {currentPage === 'dashboard' && <Dashboard />}
          {currentPage === 'settings' && <Settings />}
        </Box>

        {/* Footer */}
        <Paper square elevation={0} sx={{ py: 1.5, px: 3, backgroundColor: '#0A0E1A' }}>
          <Container maxWidth="xl">
            <Typography variant="body2" align="center" sx={{ color: 'rgba(255,255,255,0.5)', fontSize: '0.75rem' }}>
              ComplianceGuard v0.1.0-beta — Collect. Evaluate. Comply.
            </Typography>
          </Container>
        </Paper>
      </Box>
    </ThemeProvider>
  );
}

export default App;
