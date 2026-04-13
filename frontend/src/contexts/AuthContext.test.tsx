import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import { renderHook } from '@testing-library/react';
import { ReactNode } from 'react';
import { AuthProvider, useAuth } from '../contexts/AuthContext';
import { LicenseProvider, useLicense } from '../contexts/LicenseContext';

// ─── Mock axios ──────────────────────────────────────────────────────────────

vi.mock('axios', () => ({
  default: {
    post: vi.fn(),
    get: vi.fn(),
  },
}));

const mockUser = {
  id: 1,
  email: 'test@example.com',
  first_name: 'Test',
  last_name: 'User',
  is_active: true,
};

const mockToken = 'mock.jwt.token';

// ─── Helpers ─────────────────────────────────────────────────────────────────

const AuthWrapper = ({ children }: { children: ReactNode }) => (
  <AuthProvider>{children}</AuthProvider>
);

const LicenseWrapper = ({ children }: { children: ReactNode }) => (
  <LicenseProvider>{children}</LicenseProvider>
);

// ─── AuthContext ──────────────────────────────────────────────────────────────

describe('AuthContext', () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    localStorage.clear();
    const axios = await import('axios');
    // Default: no stored token → health check not called → loading false
    (axios.default.get as any).mockRejectedValue(new Error('no server'));
  });

  afterEach(() => {
    localStorage.clear();
  });

  // ─── initial state ──────────────────────────────────────────────────────

  describe('initial state', () => {
    it('user is null with no stored token', async () => {
      const { result } = renderHook(() => useAuth(), { wrapper: AuthWrapper });
      await waitFor(() => expect(result.current.loading).toBe(false));
      expect(result.current.user).toBeNull();
    });

    it('token is null with no stored token', async () => {
      const { result } = renderHook(() => useAuth(), { wrapper: AuthWrapper });
      await waitFor(() => expect(result.current.loading).toBe(false));
      expect(result.current.token).toBeNull();
    });

    it('loading resolves to false without stored token', async () => {
      const { result } = renderHook(() => useAuth(), { wrapper: AuthWrapper });
      await waitFor(() => expect(result.current.loading).toBe(false));
    });

    it('loading becomes false when no token stored', async () => {
      const { result } = renderHook(() => useAuth(), { wrapper: AuthWrapper });
      await waitFor(() => expect(result.current.loading).toBe(false));
    });

    it('throws if useAuth used outside provider', () => {
      expect(() => renderHook(() => useAuth())).toThrow(
        'useAuth must be used within AuthProvider'
      );
    });
  });

  // ─── login ──────────────────────────────────────────────────────────────

  describe('login', () => {
    it('sets user and token on success', async () => {
      const axios = await import('axios');
      (axios.default.get as any).mockRejectedValue(new Error('no server'));
      (axios.default.post as any).mockResolvedValueOnce({
        data: { access_token: mockToken, user: mockUser },
      });

      const { result } = renderHook(() => useAuth(), { wrapper: AuthWrapper });
      await waitFor(() => expect(result.current.loading).toBe(false));

      await act(async () => {
        await result.current.login('test@example.com', 'Valid@pass1');
      });

      expect(result.current.user).toEqual(mockUser);
      expect(result.current.token).toBe(mockToken);
    });

    it('stores token in localStorage on success', async () => {
      const axios = await import('axios');
      (axios.default.post as any).mockResolvedValueOnce({
        data: { access_token: mockToken, user: mockUser },
      });

      const { result } = renderHook(() => useAuth(), { wrapper: AuthWrapper });
      await waitFor(() => expect(result.current.loading).toBe(false));

      await act(async () => {
        await result.current.login('test@example.com', 'Valid@pass1');
      });

      expect(localStorage.getItem('auth_token')).toBe(mockToken);
    });

    it('stores user in localStorage on success', async () => {
      const axios = await import('axios');
      (axios.default.post as any).mockResolvedValueOnce({
        data: { access_token: mockToken, user: mockUser },
      });

      const { result } = renderHook(() => useAuth(), { wrapper: AuthWrapper });
      await waitFor(() => expect(result.current.loading).toBe(false));

      await act(async () => {
        await result.current.login('test@example.com', 'Valid@pass1');
      });

      expect(JSON.parse(localStorage.getItem('auth_user')!)).toEqual(mockUser);
    });

    it('throws on failed login', async () => {
      const axios = await import('axios');
      (axios.default.post as any).mockRejectedValueOnce(new Error('401'));

      const { result } = renderHook(() => useAuth(), { wrapper: AuthWrapper });
      await waitFor(() => expect(result.current.loading).toBe(false));

      await expect(
        act(async () => {
          await result.current.login('bad@example.com', 'wrong');
        })
      ).rejects.toThrow();
    });

    it('user remains null on failed login', async () => {
      const axios = await import('axios');
      (axios.default.post as any).mockRejectedValueOnce(new Error('401'));

      const { result } = renderHook(() => useAuth(), { wrapper: AuthWrapper });
      await waitFor(() => expect(result.current.loading).toBe(false));

      try {
        await act(async () => {
          await result.current.login('bad@example.com', 'wrong');
        });
      } catch {}

      expect(result.current.user).toBeNull();
    });

    it('posts to correct login endpoint', async () => {
      const axios = await import('axios');
      (axios.default.post as any).mockResolvedValueOnce({
        data: { access_token: mockToken, user: mockUser },
      });

      const { result } = renderHook(() => useAuth(), { wrapper: AuthWrapper });
      await waitFor(() => expect(result.current.loading).toBe(false));

      await act(async () => {
        await result.current.login('test@example.com', 'Valid@pass1');
      });

      const callUrl = (axios.default.post as any).mock.calls[0][0];
      expect(callUrl).toContain('/api/auth/login');
    });
  });

  // ─── register ───────────────────────────────────────────────────────────

  describe('register', () => {
    it('sets user and token on success', async () => {
      const axios = await import('axios');
      (axios.default.post as any).mockResolvedValueOnce({
        data: { access_token: mockToken, user: mockUser },
      });

      const { result } = renderHook(() => useAuth(), { wrapper: AuthWrapper });
      await waitFor(() => expect(result.current.loading).toBe(false));

      await act(async () => {
        await result.current.register('test@example.com', 'Valid@pass1', 'Test', 'User');
      });

      expect(result.current.user).toEqual(mockUser);
      expect(result.current.token).toBe(mockToken);
    });

    it('stores token in localStorage on success', async () => {
      const axios = await import('axios');
      (axios.default.post as any).mockResolvedValueOnce({
        data: { access_token: mockToken, user: mockUser },
      });

      const { result } = renderHook(() => useAuth(), { wrapper: AuthWrapper });
      await waitFor(() => expect(result.current.loading).toBe(false));

      await act(async () => {
        await result.current.register('test@example.com', 'Valid@pass1', 'Test', 'User');
      });

      expect(localStorage.getItem('auth_token')).toBe(mockToken);
    });

    it('throws on failed register', async () => {
      const axios = await import('axios');
      (axios.default.post as any).mockRejectedValueOnce(new Error('400'));

      const { result } = renderHook(() => useAuth(), { wrapper: AuthWrapper });
      await waitFor(() => expect(result.current.loading).toBe(false));

      await expect(
        act(async () => {
          await result.current.register('bad@example.com', 'weak', '', '');
        })
      ).rejects.toThrow();
    });

    it('posts to correct register endpoint', async () => {
      const axios = await import('axios');
      (axios.default.post as any).mockResolvedValueOnce({
        data: { access_token: mockToken, user: mockUser },
      });

      const { result } = renderHook(() => useAuth(), { wrapper: AuthWrapper });
      await waitFor(() => expect(result.current.loading).toBe(false));

      await act(async () => {
        await result.current.register('test@example.com', 'Valid@pass1', 'Test', 'User');
      });

      const callUrl = (axios.default.post as any).mock.calls[0][0];
      expect(callUrl).toContain('/api/auth/register');
    });

    it('sends first and last name in register payload', async () => {
      const axios = await import('axios');
      (axios.default.post as any).mockResolvedValueOnce({
        data: { access_token: mockToken, user: mockUser },
      });

      const { result } = renderHook(() => useAuth(), { wrapper: AuthWrapper });
      await waitFor(() => expect(result.current.loading).toBe(false));

      await act(async () => {
        await result.current.register('test@example.com', 'Valid@pass1', 'John', 'Doe');
      });

      const payload = (axios.default.post as any).mock.calls[0][1];
      expect(payload.first_name).toBe('John');
      expect(payload.last_name).toBe('Doe');
    });
  });

  // ─── logout ─────────────────────────────────────────────────────────────

  describe('logout', () => {
    it('clears user on logout', async () => {
      const axios = await import('axios');
      (axios.default.post as any).mockResolvedValueOnce({
        data: { access_token: mockToken, user: mockUser },
      });

      const { result } = renderHook(() => useAuth(), { wrapper: AuthWrapper });
      await waitFor(() => expect(result.current.loading).toBe(false));

      await act(async () => {
        await result.current.login('test@example.com', 'Valid@pass1');
      });

      act(() => result.current.logout());

      expect(result.current.user).toBeNull();
    });

    it('clears token on logout', async () => {
      const axios = await import('axios');
      (axios.default.post as any).mockResolvedValueOnce({
        data: { access_token: mockToken, user: mockUser },
      });

      const { result } = renderHook(() => useAuth(), { wrapper: AuthWrapper });
      await waitFor(() => expect(result.current.loading).toBe(false));

      await act(async () => {
        await result.current.login('test@example.com', 'Valid@pass1');
      });

      act(() => result.current.logout());

      expect(result.current.token).toBeNull();
    });

    it('removes token from localStorage on logout', async () => {
      const axios = await import('axios');
      (axios.default.post as any).mockResolvedValueOnce({
        data: { access_token: mockToken, user: mockUser },
      });

      const { result } = renderHook(() => useAuth(), { wrapper: AuthWrapper });
      await waitFor(() => expect(result.current.loading).toBe(false));

      await act(async () => {
        await result.current.login('test@example.com', 'Valid@pass1');
      });

      act(() => result.current.logout());

      expect(localStorage.getItem('auth_token')).toBeNull();
      expect(localStorage.getItem('auth_user')).toBeNull();
    });
  });

  // ─── stored token rehydration ────────────────────────────────────────────

  describe('stored token rehydration', () => {
    it('restores user from localStorage if token valid', async () => {
      localStorage.setItem('auth_token', mockToken);
      localStorage.setItem('auth_user', JSON.stringify(mockUser));

      const axios = await import('axios');
      (axios.default.get as any).mockResolvedValueOnce({ data: { status: 'healthy' } });

      const { result } = renderHook(() => useAuth(), { wrapper: AuthWrapper });
      await waitFor(() => expect(result.current.loading).toBe(false));

      expect(result.current.user).toEqual(mockUser);
    });

    it('clears localStorage if stored token is invalid', async () => {
      localStorage.setItem('auth_token', 'bad.token');
      localStorage.setItem('auth_user', JSON.stringify(mockUser));

      const axios = await import('axios');
      (axios.default.get as any).mockRejectedValueOnce(new Error('401'));

      const { result } = renderHook(() => useAuth(), { wrapper: AuthWrapper });
      await waitFor(() => expect(result.current.loading).toBe(false));

      expect(result.current.user).toBeNull();
      expect(localStorage.getItem('auth_token')).toBeNull();
    });

    it('loading becomes false after invalid token cleared', async () => {
      localStorage.setItem('auth_token', 'bad.token');

      const axios = await import('axios');
      (axios.default.get as any).mockRejectedValueOnce(new Error('401'));

      const { result } = renderHook(() => useAuth(), { wrapper: AuthWrapper });
      await waitFor(() => expect(result.current.loading).toBe(false));

      expect(result.current.loading).toBe(false);
    });
  });
});

// ─── LicenseContext ───────────────────────────────────────────────────────────

describe('LicenseContext', () => {
  beforeEach(() => {
    // Ensure web mode (no electronAPI)
    (window as any).electronAPI = undefined;
  });

  afterEach(() => {
    (window as any).electronAPI = undefined;
  });

  describe('web mode (no electronAPI)', () => {
    it('tier defaults to free', async () => {
      const { result } = renderHook(() => useLicense(), { wrapper: LicenseWrapper });
      await waitFor(() => expect(result.current.loading).toBe(false));
      expect(result.current.tier).toBe('free');
    });

    it('loading becomes false in web mode', async () => {
      const { result } = renderHook(() => useLicense(), { wrapper: LicenseWrapper });
      await waitFor(() => expect(result.current.loading).toBe(false));
    });

    it('isFeatureAllowed returns false for gated features on free tier', async () => {
      const { result } = renderHook(() => useLicense(), { wrapper: LicenseWrapper });
      await waitFor(() => expect(result.current.loading).toBe(false));

      expect(result.current.isFeatureAllowed('all_controls')).toBe(false);
      expect(result.current.isFeatureAllowed('pdf_reports')).toBe(false);
      expect(result.current.isFeatureAllowed('evaluation_history')).toBe(false);
      expect(result.current.isFeatureAllowed('remediation')).toBe(false);
      expect(result.current.isFeatureAllowed('evidence_upload')).toBe(false);
      expect(result.current.isFeatureAllowed('per_control_scoring')).toBe(false);
    });

    it('isFeatureAllowed returns true for unknown features', async () => {
      const { result } = renderHook(() => useLicense(), { wrapper: LicenseWrapper });
      await waitFor(() => expect(result.current.loading).toBe(false));
      expect(result.current.isFeatureAllowed('ungated_feature')).toBe(true);
    });

    it('activateLicense returns error in web mode', async () => {
      const { result } = renderHook(() => useLicense(), { wrapper: LicenseWrapper });
      await waitFor(() => expect(result.current.loading).toBe(false));

      const res = await result.current.activateLicense('some-key');
      expect(res.valid).toBe(false);
      expect(res.error).toContain('desktop');
    });

    it('deactivateLicense does nothing in web mode', async () => {
      const { result } = renderHook(() => useLicense(), { wrapper: LicenseWrapper });
      await waitFor(() => expect(result.current.loading).toBe(false));

      // Should not throw
      await expect(result.current.deactivateLicense()).resolves.toBeUndefined();
    });

    it('licenseInfo defaults to free tier', async () => {
      const { result } = renderHook(() => useLicense(), { wrapper: LicenseWrapper });
      await waitFor(() => expect(result.current.loading).toBe(false));
      expect(result.current.licenseInfo.tier).toBe('free');
    });
  });

  describe('web mode additional coverage', () => {
    it('activateLicense returns valid false with desktop error message', async () => {
      const { result } = renderHook(() => useLicense(), { wrapper: LicenseWrapper });
      await waitFor(() => expect(result.current.loading).toBe(false));
      const res = await result.current.activateLicense('any-key');
      expect(res.valid).toBe(false);
      expect(res.error).toBeDefined();
    });

    it('deactivateLicense resolves without throwing in web mode', async () => {
      const { result } = renderHook(() => useLicense(), { wrapper: LicenseWrapper });
      await waitFor(() => expect(result.current.loading).toBe(false));
      await expect(result.current.deactivateLicense()).resolves.toBeUndefined();
    });

    it('tier stays free after failed activateLicense', async () => {
      const { result } = renderHook(() => useLicense(), { wrapper: LicenseWrapper });
      await waitFor(() => expect(result.current.loading).toBe(false));
      await result.current.activateLicense('bad-key');
      expect(result.current.tier).toBe('free');
    });

    it('all gated features blocked on free tier', async () => {
      const { result } = renderHook(() => useLicense(), { wrapper: LicenseWrapper });
      await waitFor(() => expect(result.current.loading).toBe(false));
      const gated = ['all_controls', 'per_control_scoring', 'remediation', 'pdf_reports', 'evidence_upload', 'evaluation_history'];
      gated.forEach(f => expect(result.current.isFeatureAllowed(f)).toBe(false));
    });

    it('multiple unknown features all return true', async () => {
      const { result } = renderHook(() => useLicense(), { wrapper: LicenseWrapper });
      await waitFor(() => expect(result.current.loading).toBe(false));
      ['custom_feature', 'another_feature', 'yet_another'].forEach(f =>
        expect(result.current.isFeatureAllowed(f)).toBe(true)
      );
    });
  });
});
