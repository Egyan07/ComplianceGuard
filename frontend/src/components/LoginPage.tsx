import { useState } from 'react';
import {
  Box,
  Card,
  CardContent,
  TextField,
  Button,
  Typography,
  Alert,
  Tab,
  Tabs,
  CircularProgress,
} from '@mui/material';
import { useAuth } from '../contexts/AuthContext';
import { getErrorMessage } from '../lib/errors';

const PASSWORD_RULE = 'At least 8 characters, with an uppercase letter, a lowercase letter, a digit, and a special character.';

/**
 * Flatten any API error payload into a human-readable string.
 *
 * FastAPI request-validation failures (422) return `detail` as an ARRAY of
 * issue objects — feeding that straight into an Alert renders "[object
 * Object]" (or worse, crashes React on a non-node value). Route the value
 * through here so every failure becomes readable text.
 */
function extractApiError(err: unknown, fallback: string): string {
  const detail = (err as { response?: { data?: { detail?: unknown } } })?.response?.data?.detail;
  if (typeof detail === 'string' && detail.trim()) return detail;
  if (Array.isArray(detail)) {
    const parts = detail
      .map((issue) => {
        if (issue && typeof issue === 'object') {
          const msg = (issue as { msg?: unknown }).msg;
          const loc = (issue as { loc?: unknown[] }).loc;
          const field = Array.isArray(loc) ? loc.filter((p) => p !== 'body').join('.') : '';
          return field ? `${field}: ${String(msg ?? '')}` : String(msg ?? '');
        }
        return String(issue);
      })
      .filter(Boolean);
    if (parts.length) return parts.join('; ');
  }
  return getErrorMessage(err, fallback);
}

export default function LoginPage() {
  const { login, register } = useAuth();
  const [tab, setTab] = useState(0); // 0 = login, 1 = register
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSubmitting(true);

    try {
      if (tab === 0) {
        await login(email, password);
      } else {
        await register(email, password, firstName, lastName);
      }
    } catch (err) {
      const status = (err as { response?: { status?: number } })?.response?.status;
      const message = extractApiError(err, 'Something went wrong');
      if (status === 400 && message.includes('Unable to register')) {
        // Product decision: say what actually happened. The generic wording
        // was an anti-enumeration choice, but it left users who simply forgot
        // they had an account stranded with no next step.
        setError('An account with this email already exists. Sign in instead, or use a different email.');
      } else if (status === 400 && message.startsWith('Password must contain')) {
        setError(`${message}. ${PASSWORD_RULE}`);
      } else {
        setError(message);
      }
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Box
      sx={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: 'background.default',
        px: 2,
      }}
    >
      <Card sx={{ width: 420, maxWidth: '100%' }}>
        <CardContent sx={{ p: 4 }}>
          {/* Brand */}
          <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', mb: 3, gap: 1.5 }}>
            <Box
              sx={{
                width: 42,
                height: 42,
                borderRadius: '10px',
                backgroundColor: 'primary.main',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <Typography sx={{ color: '#fff', fontWeight: 700, fontSize: '1rem', letterSpacing: '-0.5px' }}>
                CG
              </Typography>
            </Box>
            <Typography
              component="h1"
              sx={{ fontWeight: 700, fontSize: '1.25rem', letterSpacing: '-0.5px', color: 'text.primary' }}
            >
              ComplianceGuard
            </Typography>
          </Box>

          <Tabs value={tab} onChange={(_, v) => { setTab(v); setError(''); }} centered sx={{ mb: 3 }}>
            <Tab label="Sign In" />
            <Tab label="Create Account" />
          </Tabs>

          {error && (
            <Alert severity="error" sx={{ mb: 2 }}>
              {error}
            </Alert>
          )}

          <form onSubmit={handleSubmit}>
            {tab === 1 && (
              <Box sx={{ display: 'flex', gap: 1.5, mb: 2 }}>
                <TextField
                  label="First Name"
                  size="small"
                  fullWidth
                  value={firstName}
                  onChange={(e) => setFirstName(e.target.value)}
                  required
                />
                <TextField
                  label="Last Name"
                  size="small"
                  fullWidth
                  value={lastName}
                  onChange={(e) => setLastName(e.target.value)}
                  required
                />
              </Box>
            )}

            <TextField
              label="Email"
              type="email"
              size="small"
              fullWidth
              sx={{ mb: 2 }}
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />

            <TextField
              label="Password"
              type="password"
              size="small"
              fullWidth
              sx={{ mb: 1 }}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              helperText={
                tab === 1
                  ? PASSWORD_RULE
                  : undefined
              }
            />

            <Button
              type="submit"
              variant="contained"
              fullWidth
              disabled={submitting}
              sx={{ height: 40, mt: tab === 1 ? 1 : 3 }}
            >
              {submitting ? <CircularProgress size={22} color="inherit" /> : tab === 0 ? 'Sign In' : 'Create Account'}
            </Button>
          </form>

          <Typography
            sx={{ display: 'block', textAlign: 'center', mt: 3, fontSize: '0.75rem', color: 'text.secondary' }}
          >
            SOC 2 · ISO 27001 · HIPAA · GDPR — Endpoint Evidence Readiness
          </Typography>
        </CardContent>
      </Card>
    </Box>
  );
}
