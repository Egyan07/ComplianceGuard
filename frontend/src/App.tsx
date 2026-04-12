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
  History
} from '@mui/icons-material';
import Dashboard from './components/Dashboard';
import Settings from './components/Settings';
import EvaluationHistory from './components/EvaluationHistory';
import ErrorBoundary from './components/ErrorBoundary';
import { LicenseProvider, useLicense } from './contexts/LicenseContext';

type Page = 'dashboard' | 'history' | 'settings';

const theme = createTheme({
  palette: {
    primary: {
      main: '#2563EB',
      dark: '#1E40AF',
      light: '#3B82F6',
    },
    secondary: {
      main: '#10B981',
    },
    background: {
      default: '#F8FAFC',
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

function AppContent() {
  const [currentPage, setCurrentPage] = useState<Page>('dashboard');
  const { tier } = useLicense();

  return (
    <Box sx={{ flexGrow: 1, minHeight: '100vh', display: 'flex', flexDirection: 'column' }}>
      {/* App Bar */}
      <AppBar
          position="static"
          elevation={0}
          sx={{
            backgroundColor: '#FFFFFF',
            borderBottom: '1px solid',
            borderColor: 'divider',
          }}
        >
          <Toolbar>
            <Box
              sx={{
                width: 32,
                height: 32,
                borderRadius: '8px',
                backgroundColor: '#2563EB',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                mr: 1.5,
              }}
            >
              <Typography
                sx={{
                  color: '#FFFFFF',
                  fontWeight: 700,
                  fontSize: '0.75rem',
                  letterSpacing: '-0.5px',
                }}
              >
                CG
              </Typography>
            </Box>
            <Typography
              variant="h6"
              component="div"
              sx={{ fontWeight: 'bold', letterSpacing: '-0.5px', color: '#111827' }}
            >
              ComplianceGuard
            </Typography>
            <Chip
              label={tier === 'pro' ? 'PRO' : 'FREE'}
              size="small"
              sx={{
                ml: 1.5,
                height: 20,
                fontSize: '0.65rem',
                fontWeight: 600,
                backgroundColor: tier === 'pro' ? '#D1FAE5' : '#EFF6FF',
                color: tier === 'pro' ? '#065F46' : '#2563EB',
                letterSpacing: '1px',
              }}
            />

            <Box sx={{ flexGrow: 1 }} />

            {/* Navigation */}
            <Tooltip title="Dashboard">
              <IconButton
                onClick={() => setCurrentPage('dashboard')}
                sx={{
                  color: currentPage === 'dashboard' ? '#2563EB' : '#6B7280',
                  backgroundColor: currentPage === 'dashboard' ? '#EFF6FF' : 'transparent',
                  mr: 0.5,
                }}
              >
                <DashboardIcon />
              </IconButton>
            </Tooltip>
            <Tooltip title="Evaluation History">
              <IconButton
                onClick={() => setCurrentPage('history')}
                sx={{
                  color: currentPage === 'history' ? '#2563EB' : '#6B7280',
                  backgroundColor: currentPage === 'history' ? '#EFF6FF' : 'transparent',
                  mr: 0.5,
                }}
              >
                <History />
              </IconButton>
            </Tooltip>
            <Tooltip title="Settings">
              <IconButton
                onClick={() => setCurrentPage('settings')}
                sx={{
                  color: currentPage === 'settings' ? '#2563EB' : '#6B7280',
                  backgroundColor: currentPage === 'settings' ? '#EFF6FF' : 'transparent',
                }}
              >
                <SettingsIcon />
              </IconButton>
            </Tooltip>
          </Toolbar>
        </AppBar>

        {/* Main Content */}
        <Box component="main" sx={{ flexGrow: 1, backgroundColor: 'background.default' }}>
          <ErrorBoundary>
            {currentPage === 'dashboard' && <Dashboard onNavigate={setCurrentPage} />}
            {currentPage === 'history' && <EvaluationHistory onNavigate={setCurrentPage} />}
            {currentPage === 'settings' && <Settings />}
          </ErrorBoundary>
        </Box>

        {/* Footer */}
        <Paper
          square
          elevation={0}
          sx={{
            py: 1.5,
            px: 3,
            backgroundColor: '#F8FAFC',
            borderTop: '1px solid',
            borderColor: 'divider',
          }}
        >
          <Container maxWidth="xl">
            <Typography
              variant="body2"
              align="center"
              sx={{ color: '#9CA3AF', fontSize: '0.75rem' }}
            >
              ComplianceGuard v2.0.0 — Collect. Evaluate. Comply.
            </Typography>
          </Container>
        </Paper>
      </Box>
  );
}

function App() {
  return (
    <ThemeProvider theme={theme}>
      <CssBaseline />
      <LicenseProvider>
        <AppContent />
      </LicenseProvider>
    </ThemeProvider>
  );
}

export default App;
