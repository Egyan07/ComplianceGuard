/*
ComplianceGuard SOC 2 Platform - Main Application Component

Root component that sets up Material-UI theming and renders the dashboard.
Provides consistent styling and layout across the application.
*/

import {
  ThemeProvider,
  createTheme,
  CssBaseline,
  Box,
  AppBar,
  Toolbar,
  Typography,
  Container,
  Paper
} from '@mui/material';
import Dashboard from './components/Dashboard';

// Create Material-UI theme for consistent styling
const theme = createTheme({
  palette: {
    primary: {
      main: '#1976d2',
    },
    secondary: {
      main: '#dc004e',
    },
    background: {
      default: '#f5f5f5',
    },
  },
  typography: {
    fontFamily: '"Roboto", "Helvetica", "Arial", sans-serif',
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
          boxShadow: '0 2px 8px rgba(0,0,0,0.1)',
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
  },
});

function App() {
  return (
    <ThemeProvider theme={theme}>
      <CssBaseline />
      <Box sx={{ flexGrow: 1, minHeight: '100vh', display: 'flex', flexDirection: 'column' }}>
        {/* App Bar */}
        <AppBar position="static" elevation={0}>
          <Toolbar>
            <Typography variant="h6" component="div" sx={{ flexGrow: 1, fontWeight: 'bold' }}>
              ComplianceGuard SOC 2 Platform
            </Typography>
            <Typography variant="body2" color="text.secondary">
              v0.1.0
            </Typography>
          </Toolbar>
        </AppBar>

        {/* Main Content */}
        <Box component="main" sx={{ flexGrow: 1, py: 3, backgroundColor: 'background.default' }}>
          <Container maxWidth="xl">
            <Dashboard />
          </Container>
        </Box>

        {/* Footer */}
        <Paper square sx={{ py: 2, px: 3, backgroundColor: 'grey.100' }}>
          <Container maxWidth="xl">
            <Typography variant="body2" color="text.secondary" align="center">
              ComplianceGuard SOC 2 Automation Platform v0.1.0 •
              Built with React, TypeScript, and Material-UI
            </Typography>
          </Container>
        </Paper>
      </Box>
    </ThemeProvider>
  );
}

export default App;