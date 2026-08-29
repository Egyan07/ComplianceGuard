import { lazy, Suspense } from 'react';
import { Box, CircularProgress } from '@mui/material';
import { HashRouter, Routes, Route, useNavigate, useSearchParams, useLocation } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import ErrorBoundary from './components/ErrorBoundary';
import LoginPage from './components/LoginPage';
import AppShell from './components/layout/AppShell';
import { LicenseProvider } from './contexts/LicenseContext';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import { isElectronMode } from './services/electron';

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

function AppContent() {
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
    <AppShell selectedFramework={selectedFramework}>
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

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <LicenseProvider>
          <HashRouter>
            <AppContent />
          </HashRouter>
        </LicenseProvider>
      </AuthProvider>
    </QueryClientProvider>
  );
}

export default App;
