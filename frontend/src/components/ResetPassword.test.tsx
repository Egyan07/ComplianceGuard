import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { vi, describe, it, expect, beforeEach } from 'vitest';
import ResetPassword from './ResetPassword';
import * as api from '../services/api';

vi.mock('../services/api', () => ({ resetPasswordHttp: vi.fn() }));

function renderAt(search: string) {
  return render(
    <MemoryRouter initialEntries={[`/reset-password${search}`]}>
      <ResetPassword />
    </MemoryRouter>,
  );
}

describe('ResetPassword', () => {
  beforeEach(() => vi.clearAllMocks());

  it('rejects mismatched passwords without calling the API', async () => {
    renderAt('?token=t');
    fireEvent.change(screen.getByLabelText('New password'), { target: { value: 'NewPass@123' } });
    fireEvent.change(screen.getByLabelText('Confirm new password'), { target: { value: 'Different@1' } });
    fireEvent.click(screen.getByRole('button', { name: /reset password/i }));
    await waitFor(() => expect(screen.getByText(/do not match/i)).toBeInTheDocument());
    expect(api.resetPasswordHttp).not.toHaveBeenCalled();
  });

  it('submits the new password with the token and shows success', async () => {
    (api.resetPasswordHttp as ReturnType<typeof vi.fn>).mockResolvedValue({ message: 'ok' });
    renderAt('?token=reset-tok');
    fireEvent.change(screen.getByLabelText('New password'), { target: { value: 'NewPass@123' } });
    fireEvent.change(screen.getByLabelText('Confirm new password'), { target: { value: 'NewPass@123' } });
    fireEvent.click(screen.getByRole('button', { name: /reset password/i }));
    await waitFor(() => expect(screen.getByText(/has been reset/i)).toBeInTheDocument());
    expect(api.resetPasswordHttp).toHaveBeenCalledWith('reset-tok', 'NewPass@123');
  });

  it('surfaces a server error', async () => {
    (api.resetPasswordHttp as ReturnType<typeof vi.fn>).mockRejectedValue({
      response: { data: { detail: 'Invalid or expired reset token' } },
    });
    renderAt('?token=expired');
    fireEvent.change(screen.getByLabelText('New password'), { target: { value: 'NewPass@123' } });
    fireEvent.change(screen.getByLabelText('Confirm new password'), { target: { value: 'NewPass@123' } });
    fireEvent.click(screen.getByRole('button', { name: /reset password/i }));
    await waitFor(() => expect(screen.getByText(/Invalid or expired reset token/i)).toBeInTheDocument());
  });
});
