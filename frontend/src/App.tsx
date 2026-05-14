import { Box, CircularProgress } from '@mui/material';
import { HashRouter, Routes, Route, useNavigate, useSearchParams } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import Dashboard from './components/Dashboard';
import Settings from './components/Settings';
import EvaluationHistory from './components/EvaluationHistory';
import CloudDashboard from './components/CloudDashboard';
import FrameworkBrowser from './components/FrameworkBrowser';
import ErrorBoundary from './components/ErrorBoundary';
import LoginPage from './components/LoginPage';
import AppShell from './components/layout/AppShell';
import { LicenseProvider } from './contexts/LicenseContext';
import { AuthProvider, useAuth } from './contexts/AuthContext';

const queryClient = new QueryClient({
  defaultOptions: { queries: { staleTime: 30_000, retry: 1 } },
});

function AppContent() {
  const { user, loading: authLoading } = useAuth();
  const navigate = useNavigate();
  const isElectron = !!(window as any).electronAPI;
  const [searchParams] = useSearchParams();
  const selectedFramework = Math.max(1, Math.min(3, Number(searchParams.get('fw') || '1'))) as 1 | 2 | 3;

  if (authLoading) {
    return (
      <Box sx={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <CircularProgress />
      </Box>
    );
  }

  if (!isElectron && !user) {
    return <LoginPage />;
  }

  return (
    <AppShell selectedFramework={selectedFramework}>
      <ErrorBoundary>
        <Routes>
          <Route path="/" element={<Dashboard onNavigate={navigate} />} />
          <Route path="/history" element={<EvaluationHistory onNavigate={navigate} />} />
          <Route path="/cloud" element={<CloudDashboard onNavigate={navigate} />} />
          <Route path="/frameworks" element={<FrameworkBrowser />} />
          <Route path="/settings" element={<Settings />} />
        </Routes>
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
