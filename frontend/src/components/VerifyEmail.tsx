import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Box, Paper, Typography, CircularProgress, Alert, Button } from '@mui/material';
import { verifyEmailHttp } from '../services/api';

type Status = 'verifying' | 'success' | 'error';

function extractError(err: unknown): string {
  if (typeof err === 'object' && err !== null) {
    const e = err as { response?: { data?: { detail?: unknown } } };
    const detail = e.response?.data?.detail;
    if (typeof detail === 'string') return detail;
  }
  return 'Verification failed. The link may be invalid or already used.';
}

/**
 * Public page reached from the verification email link
 * (#/verify-email?token=...). POSTs the token to the API on mount.
 */
export default function VerifyEmail() {
  const [searchParams] = useSearchParams();
  const token = searchParams.get('token');
  const [status, setStatus] = useState<Status>('verifying');
  const [message, setMessage] = useState('');

  useEffect(() => {
    if (!token) {
      setStatus('error');
      setMessage('No verification token provided.');
      return;
    }
    let active = true;
    verifyEmailHttp(token)
      .then(() => { if (active) { setStatus('success'); } })
      .catch((err) => { if (active) { setStatus('error'); setMessage(extractError(err)); } });
    return () => { active = false; };
  }, [token]);

  return (
    <Box sx={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', bgcolor: '#f5f5f7', p: 2 }}>
      <Paper sx={{ p: 5, maxWidth: 440, width: '100%', textAlign: 'center', borderRadius: '20px' }}>
        <Typography variant="h6" sx={{ mb: 2, fontWeight: 600 }}>Email Verification</Typography>
        {status === 'verifying' && (
          <Box sx={{ py: 2 }}><CircularProgress /><Typography sx={{ mt: 2 }} color="text.secondary">Verifying your email…</Typography></Box>
        )}
        {status === 'success' && (
          <>
            <Alert severity="success" sx={{ mb: 3 }}>Your email has been verified.</Alert>
            <Button variant="contained" href="#/">Go to ComplianceGuard</Button>
          </>
        )}
        {status === 'error' && (
          <Alert severity="error">{message}</Alert>
        )}
      </Paper>
    </Box>
  );
}
