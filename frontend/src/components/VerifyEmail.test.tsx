import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { vi, describe, it, expect, beforeEach } from 'vitest';
import VerifyEmail from './VerifyEmail';
import * as api from '../services/api';

vi.mock('../services/api', () => ({ verifyEmailHttp: vi.fn() }));

function renderAt(search: string) {
  return render(
    <MemoryRouter initialEntries={[`/verify-email${search}`]}>
      <VerifyEmail />
    </MemoryRouter>,
  );
}

describe('VerifyEmail', () => {
  beforeEach(() => vi.clearAllMocks());

  it('verifies the token and shows success', async () => {
    (api.verifyEmailHttp as ReturnType<typeof vi.fn>).mockResolvedValue({ message: 'ok' });
    renderAt('?token=good-token');
    await waitFor(() => expect(screen.getByText(/has been verified/i)).toBeInTheDocument());
    expect(api.verifyEmailHttp).toHaveBeenCalledWith('good-token');
  });

  it('shows an error when verification fails', async () => {
    (api.verifyEmailHttp as ReturnType<typeof vi.fn>).mockRejectedValue({
      response: { data: { detail: 'Invalid or expired verification token' } },
    });
    renderAt('?token=bad');
    await waitFor(() => expect(screen.getByText(/Invalid or expired verification token/i)).toBeInTheDocument());
  });

  it('shows an error and does not call the API when no token is present', async () => {
    renderAt('');
    await waitFor(() => expect(screen.getByText(/No verification token/i)).toBeInTheDocument());
    expect(api.verifyEmailHttp).not.toHaveBeenCalled();
  });
});
