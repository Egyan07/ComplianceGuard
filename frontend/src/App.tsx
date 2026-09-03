import { lazy, Suspense } from 'react';
import { Box, CircularProgress, CssBaseline } from '@mui/material';
import { ThemeProvider } from '@mui/material/styles';
import { HashRouter, Routes, Route, useNavigate, useSearchParams, useLocation } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import ErrorBoundary from './components/ErrorBoundary';
import LoginPage from './components/LoginPage';
import AppShell from './components/layout/AppShell';
import { LicenseProvider } from './contexts/LicenseContext';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import { isElectronMode } from './services/electron';
import { useColorMode } from './hooks/useColorMode';
import { getTheme } from './theme';

// Route-level code splitting: each page is loaded on first navigation instead
// of shipping the whole app (MUI + framer-motion) in one bundle.
const Dashboard = lazy(() => import('./components/Dashboard'));
const Settings = lazy(() => import('./components/Settings'));
const EvaluationHistory = lazy(() => import('./components/EvaluationHistory'));
const CloudDashboard = lazy(() => import('./components/CloudDashboard'));
const FrameworkBrowser = lazy(() => import('./components/FrameworkBrowser'));
const VerifyEmail = lazy(() => import('./components/VerifyEmail'));
const ResetPassword = lazy(() => import('./components/ResetPassword'));

const queryClient = new QueryClient({
  defaultOptions: { queries: { staleTime: 30_000, retry: 1 } },
});

function PageFallback() {
  return (
    <Box sx={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <CircularProgress />
    </Box>
  );
}

interface AppContentProps {
  mode: 'light' | 'dark';
  onToggleMode: () => void;
}

function AppContent({ mode, onToggleMode }: AppContentProps) {
  const { user, loading: authLoading } = useAuth();
  const navigate = useNavigate();
  const isElectron = isElectronMode();
  const [searchParams] = useSearchParams();
  const location = useLocation();
  const selectedFramework = Math.max(1, Math.min(4, Number(searchParams.get('fw') || '1'))) as 1 | 2 | 3 | 4;

  // Public, no-auth pages reached from email links — must render before the
  // login gate (the recipient is not signed in).
  const publicPaths = ['/verify-email', '/reset-password'];
  if (publicPaths.includes(location.pathname)) {
    return (
      <Suspense fallback={<PageFallback />}>
        <Routes>
          <Route path="/verify-email" element={<VerifyEmail />} />
          <Route path="/reset-password" element={<ResetPassword />} />
        </Routes>
      </Suspense>
    );
  }

  if (authLoading) {
    return <PageFallback />;
  }

  if (!isElectron && !user) {
    return <LoginPage />;
  }

  return (
    <AppShell mode={mode} onToggleMode={onToggleMode} selectedFramework={selectedFramework}>
      <ErrorBoundary>
        <Suspense fallback={<PageFallback />}>
          <Routes>
            <Route path="/" element={<Dashboard onNavigate={navigate} />} />
            <Route path="/history" element={<EvaluationHistory onNavigate={navigate} />} />
            <Route path="/cloud" element={<CloudDashboard onNavigate={navigate} />} />
            <Route path="/frameworks" element={<FrameworkBrowser />} />
            <Route path="/settings" element={<Settings />} />
          </Routes>
        </Suspense>
      </ErrorBoundary>
    </AppShell>
  );
}

function ThemedApp() {
  // One theme for the whole app — including the pre-auth screens (login,
  // verify-email, reset-password) that previously rendered with default MUI.
  const { mode, toggle } = useColorMode();
  return (
    <ThemeProvider theme={getTheme(mode)}>
      <CssBaseline />
      <AuthProvider>
        <LicenseProvider>
          <HashRouter>
            <AppContent mode={mode} onToggleMode={toggle} />
          </HashRouter>
        </LicenseProvider>
      </AuthProvider>
    </ThemeProvider>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <ThemedApp />
    </QueryClientProvider>
  );
}

export default App;
