import { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Box, Paper, Typography, TextField, Button, Alert } from '@mui/material';
import { resetPasswordHttp } from '../services/api';

function extractError(err: unknown): string {
  if (typeof err === 'object' && err !== null) {
    const e = err as { response?: { data?: { detail?: unknown } } };
    const detail = e.response?.data?.detail;
    if (typeof detail === 'string') return detail;
  }
  return 'Password reset failed. The link may be invalid or expired.';
}

/**
 * Public page reached from the password-reset email link
 * (#/reset-password?token=...). Collects a new password and POSTs it with the
 * token. Password strength is enforced server-side; we only check non-empty +
 * match here.
 */
export default function ResetPassword() {
  const [searchParams] = useSearchParams();
  const token = searchParams.get('token');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  const handleSubmit = async () => {
    setError(null);
    if (!token) { setError('No reset token provided.'); return; }
    if (password !== confirm) { setError('Passwords do not match.'); return; }
    if (!password) { setError('Password is required.'); return; }
    setSubmitting(true);
    try {
      await resetPasswordHttp(token, password);
      setDone(true);
    } catch (err) {
      setError(extractError(err));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Box sx={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', bgcolor: 'background.default', p: 2 }}>
      <Paper sx={{ p: 5, maxWidth: 440, width: '100%' }}>
        <Typography component="h1" sx={{ mb: 3, fontWeight: 650, fontSize: '1.125rem', textAlign: 'center' }}>Reset Password</Typography>
        {done ? (
          <>
            <Alert severity="success" sx={{ mb: 3 }}>Your password has been reset. You can now sign in.</Alert>
            <Button fullWidth variant="contained" href="#/">Go to sign in</Button>
          </>
        ) : (
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            <TextField
              type="password" label="New password" value={password}
              onChange={(e) => setPassword(e.target.value)} fullWidth size="small"
            />
            <TextField
              type="password" label="Confirm new password" value={confirm}
              onChange={(e) => setConfirm(e.target.value)} fullWidth size="small"
            />
            {error && <Alert severity="error" sx={{ py: 0 }}>{error}</Alert>}
            <Button variant="contained" onClick={handleSubmit} disabled={submitting} fullWidth>
              {submitting ? 'Resetting…' : 'Reset password'}
            </Button>
          </Box>
        )}
      </Paper>
    </Box>
  );
}
