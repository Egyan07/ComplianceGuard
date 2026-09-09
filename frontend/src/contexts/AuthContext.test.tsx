import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { waitFor, act } from "@testing-library/react";
import { renderHook } from '@testing-library/react';
import { ReactNode } from 'react';
import { AuthProvider, useAuth } from '../contexts/AuthContext';
import { LicenseProvider, useLicense } from '../contexts/LicenseContext';
import { clearAccessToken, getAccessToken } from '../services/tokenStore';

// ─── Mock axios ──────────────────────────────────────────────────────────────

const mockAxiosInstance = {
  get: vi.fn(),
  post: vi.fn(),
  interceptors: {
    request: { use: vi.fn() },
    response: { use: vi.fn() },
  },
};

vi.mock('axios', () => ({
  default: {
    post: vi.fn(),
    get: vi.fn(),
    create: vi.fn(() => mockAxiosInstance),
  },
}));

// Prevent api.ts registerAuthCallbacks side-effects from interfering with tests
vi.mock('../services/api', () => ({
  registerAuthCallbacks: vi.fn(),
  getLicenseInfoHttp: vi.fn().mockResolvedValue({ tier: 'free' }),
  activateLicenseHttp: vi.fn().mockResolvedValue({
    tier: 'pro',
    license_id: 'L-TEST',
    email: 'buyer@example.com',
    expires_at: '2099-01-01T00:00:00Z',
    days_remaining: 999,
    is_expired: false,
    is_grace_period: false,
  }),
}));

const mockUser = {
  id: 1,
  email: 'test@example.com',
  first_name: 'Test',
  last_name: 'User',
  is_active: true,
};

const mockToken = 'mock.jwt.token';
const mockRefreshToken = 'mock.refresh.token';

const loginResponse = {
  access_token: mockToken,
  refresh_token: mockRefreshToken,
  user: mockUser,
};

// Route POST mocks by URL substring. The AuthProvider bootstrap refresh fires
// on mount before any test-driven login/register, so order-dependent
// mockResolvedValueOnce queues are unreliable — route by endpoint instead.
function routePost(axiosMock: { post: unknown }, routes: Record<string, unknown>): void {
  (axiosMock.post as ReturnType<typeof vi.fn>).mockImplementation(
    async (url: string) => {
      for (const [needle, data] of Object.entries(routes)) {
        if (url.includes(needle)) {
          if (data instanceof Error) throw data;
          return { data };
        }
      }
      throw new Error(`unrouted POST ${url}`);
    },
  );
}

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
    sessionStorage.clear();
    clearAccessToken();
    const axios = await import('axios');
    // Default: every POST fails (no valid refresh cookie, no successful login)
    // unless a test routes specific endpoints.
    (axios.default.get as any).mockRejectedValue(new Error('no server'));
    (axios.default.post as any).mockRejectedValue(new Error('no session'));
  });

  afterEach(() => {
    localStorage.clear();
    sessionStorage.clear();
    clearAccessToken();
  });

  // ─── initial state / session bootstrap ──────────────────────────────────

  describe('initial state (session bootstrap)', () => {
    it('user is null when the refresh-cookie bootstrap fails', async () => {
      const { result } = renderHook(() => useAuth(), { wrapper: AuthWrapper });
      await waitFor(() => expect(result.current.loading).toBe(false));
      expect(result.current.user).toBeNull();
    });

    it('token is null when the refresh-cookie bootstrap fails', async () => {
      const { result } = renderHook(() => useAuth(), { wrapper: AuthWrapper });
      await waitFor(() => expect(result.current.loading).toBe(false));
      expect(result.current.token).toBeNull();
      expect(getAccessToken()).toBeNull();
    });

    it('restores the session from the HttpOnly refresh cookie', async () => {
      const axios = await import('axios');
      routePost(axios.default, {
        '/auth/refresh': { access_token: mockToken, user: mockUser },
      });

      const { result } = renderHook(() => useAuth(), { wrapper: AuthWrapper });
      await waitFor(() => expect(result.current.loading).toBe(false));

      expect(result.current.user).toEqual(mockUser);
      expect(result.current.token).toBe(mockToken);
    });

    it('bootstrap refresh posts with credentials (cookie) to /auth/refresh', async () => {
      const axios = await import('axios');
      routePost(axios.default, {
        '/auth/refresh': { access_token: mockToken, user: mockUser },
      });

      renderHook(() => useAuth(), { wrapper: AuthWrapper });
      await waitFor(() => {
        const calls = (axios.default.post as any).mock.calls;
        expect(calls.some((c: unknown[]) => String(c[0]).includes('/auth/refresh'))).toBe(true);
      });

      const refreshCall = (axios.default.post as any).mock.calls.find((c: unknown[]) =>
        String(c[0]).includes('/auth/refresh'),
      );
      expect(refreshCall[2]?.withCredentials).toBe(true);
    });

    it('throws if useAuth used outside provider', () => {
      expect(() => renderHook(() => useAuth())).toThrow(
        'useAuth must be used within AuthProvider'
      );
    });
  });

  // ─── login ──────────────────────────────────────────────────────────────

  describe('login', () => {
    it('sets user and token in memory on success', async () => {
      const axios = await import('axios');
      routePost(axios.default, { '/auth/login': loginResponse });

      const { result } = renderHook(() => useAuth(), { wrapper: AuthWrapper });
      await waitFor(() => expect(result.current.loading).toBe(false));

      await act(async () => {
        await result.current.login('test@example.com', 'Valid@pass1');
      });

      expect(result.current.user).toEqual(mockUser);
      expect(result.current.token).toBe(mockToken);
      expect(getAccessToken()).toBe(mockToken);
    });

    it('does NOT persist tokens or user to web storage (H-1 regression)', async () => {
      const axios = await import('axios');
      routePost(axios.default, { '/auth/login': loginResponse });

      const { result } = renderHook(() => useAuth(), { wrapper: AuthWrapper });
      await waitFor(() => expect(result.current.loading).toBe(false));

      await act(async () => {
        await result.current.login('test@example.com', 'Valid@pass1');
      });

      // Nothing auth-related may land in localStorage/sessionStorage.
      expect(localStorage.getItem('auth_token')).toBeNull();
      expect(localStorage.getItem('auth_user')).toBeNull();
      expect(localStorage.getItem('refresh_token')).toBeNull();
      expect(sessionStorage.length).toBe(0);
    });

    it('sends credentials with the login request (cookie establishment)', async () => {
      const axios = await import('axios');
      routePost(axios.default, { '/auth/login': loginResponse });

      const { result } = renderHook(() => useAuth(), { wrapper: AuthWrapper });
      await waitFor(() => expect(result.current.loading).toBe(false));

      await act(async () => {
        await result.current.login('test@example.com', 'Valid@pass1');
      });

      const loginCall = (axios.default.post as any).mock.calls.find((c: unknown[]) =>
        String(c[0]).includes('/auth/login'),
      );
      expect(loginCall[2]?.withCredentials).toBe(true);
    });

    it('throws on failed login', async () => {
      const axios = await import('axios');
      routePost(axios.default, { '/auth/login': new Error('401') });

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
      routePost(axios.default, { '/auth/login': new Error('401') });

      const { result } = renderHook(() => useAuth(), { wrapper: AuthWrapper });
      await waitFor(() => expect(result.current.loading).toBe(false));

      try {
        await act(async () => {
          await result.current.login('bad@example.com', 'wrong');
        });
      } catch (_e) { /* expected */ }

      expect(result.current.user).toBeNull();
    });

    it('posts to correct login endpoint', async () => {
      const axios = await import('axios');
      routePost(axios.default, { '/auth/login': loginResponse });

      const { result } = renderHook(() => useAuth(), { wrapper: AuthWrapper });
      await waitFor(() => expect(result.current.loading).toBe(false));

      await act(async () => {
        await result.current.login('test@example.com', 'Valid@pass1');
      });

      const loginCall = (axios.default.post as any).mock.calls.find((c: unknown[]) =>
        String(c[0]).includes('/auth/login'),
      );
      expect(loginCall).toBeDefined();
    });
  });

  // ─── register ───────────────────────────────────────────────────────────

  describe('register', () => {
    it('sets user and token in memory on success', async () => {
      const axios = await import('axios');
      routePost(axios.default, { '/auth/register': loginResponse });

      const { result } = renderHook(() => useAuth(), { wrapper: AuthWrapper });
      await waitFor(() => expect(result.current.loading).toBe(false));

      await act(async () => {
        await result.current.register('test@example.com', 'Valid@pass1', 'Test', 'User');
      });

      expect(result.current.user).toEqual(mockUser);
      expect(result.current.token).toBe(mockToken);
    });

    it('does NOT persist tokens or user to web storage (H-1 regression)', async () => {
      const axios = await import('axios');
      routePost(axios.default, { '/auth/register': loginResponse });

      const { result } = renderHook(() => useAuth(), { wrapper: AuthWrapper });
      await waitFor(() => expect(result.current.loading).toBe(false));

      await act(async () => {
        await result.current.register('test@example.com', 'Valid@pass1', 'Test', 'User');
      });

      expect(localStorage.getItem('auth_token')).toBeNull();
      expect(localStorage.getItem('auth_user')).toBeNull();
      expect(localStorage.getItem('refresh_token')).toBeNull();
      expect(sessionStorage.length).toBe(0);
    });

    it('throws on failed register', async () => {
      const axios = await import('axios');
      routePost(axios.default, { '/auth/register': new Error('400') });

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
      routePost(axios.default, { '/auth/register': loginResponse });

      const { result } = renderHook(() => useAuth(), { wrapper: AuthWrapper });
      await waitFor(() => expect(result.current.loading).toBe(false));

      await act(async () => {
        await result.current.register('test@example.com', 'Valid@pass1', 'Test', 'User');
      });

      const registerCall = (axios.default.post as any).mock.calls.find((c: unknown[]) =>
        String(c[0]).includes('/auth/register'),
      );
      expect(registerCall).toBeDefined();
    });

    it('sends first and last name in register payload', async () => {
      const axios = await import('axios');
      routePost(axios.default, { '/auth/register': loginResponse });

      const { result } = renderHook(() => useAuth(), { wrapper: AuthWrapper });
      await waitFor(() => expect(result.current.loading).toBe(false));

      await act(async () => {
        await result.current.register('test@example.com', 'Valid@pass1', 'John', 'Doe');
      });

      const registerCall = (axios.default.post as any).mock.calls.find((c: unknown[]) =>
        String(c[0]).includes('/auth/register'),
      );
      expect(registerCall[1].first_name).toBe('John');
      expect(registerCall[1].last_name).toBe('Doe');
    });
  });

  // ─── logout ─────────────────────────────────────────────────────────────

  describe('logout', () => {
    it('clears user on logout', async () => {
      const axios = await import('axios');
      routePost(axios.default, {
        '/auth/login': loginResponse,
        '/auth/logout': { message: 'Logged out successfully' },
      });

      const { result } = renderHook(() => useAuth(), { wrapper: AuthWrapper });
      await waitFor(() => expect(result.current.loading).toBe(false));

      await act(async () => {
        await result.current.login('test@example.com', 'Valid@pass1');
      });

      await act(async () => {
        await result.current.logout();
      });

      expect(result.current.user).toBeNull();
    });

    it('calls the revocation endpoint and clears the in-memory token', async () => {
      const axios = await import('axios');
      routePost(axios.default, {
        '/auth/login': loginResponse,
        '/auth/logout': { message: 'Logged out successfully' },
      });

      const { result } = renderHook(() => useAuth(), { wrapper: AuthWrapper });
      await waitFor(() => expect(result.current.loading).toBe(false));

      await act(async () => {
        await result.current.login('test@example.com', 'Valid@pass1');
      });
      expect(getAccessToken()).toBe(mockToken);

      await act(async () => {
        await result.current.logout();
      });

      const logoutCall = (axios.default.post as any).mock.calls.find((c: unknown[]) =>
        String(c[0]).includes('/auth/logout'),
      );
      expect(logoutCall).toBeDefined();
      expect(logoutCall[2]?.withCredentials).toBe(true);
      expect(getAccessToken()).toBeNull();
      expect(result.current.token).toBeNull();
    });

    it('clears local state even when the logout endpoint fails', async () => {
      const axios = await import('axios');
      routePost(axios.default, {
        '/auth/login': loginResponse,
        '/auth/logout': new Error('network down'),
      });

      const { result } = renderHook(() => useAuth(), { wrapper: AuthWrapper });
      await waitFor(() => expect(result.current.loading).toBe(false));

      await act(async () => {
        await result.current.login('test@example.com', 'Valid@pass1');
      });

      // Network failure on logout must not keep the client logged in.
      await act(async () => {
        await result.current.logout();
      });

      expect(result.current.user).toBeNull();
      expect(result.current.token).toBeNull();
      expect(getAccessToken()).toBeNull();
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

    it('isFeatureAllowed returns false for unknown features (fail-closed)', async () => {
      const { result } = renderHook(() => useLicense(), { wrapper: LicenseWrapper });
      await waitFor(() => expect(result.current.loading).toBe(false));
      // An unknown/typo gate must NOT unlock the feature (fail-closed).
      expect(result.current.isFeatureAllowed('ungated_feature')).toBe(false);
    });

    it('activateLicense hits backend in web mode and updates local state', async () => {
      const { result } = renderHook(() => useLicense(), { wrapper: LicenseWrapper });
      await waitFor(() => expect(result.current.loading).toBe(false));

      const res = await result.current.activateLicense('some-key');
      expect(res.valid).toBe(true);
      await waitFor(() => expect(result.current.tier).toBe('pro'));
      expect(result.current.licenseInfo.licenseId).toBe('L-TEST');
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
    it('activateLicense surfaces backend error detail when activation fails', async () => {
      const api = await import('../services/api');
      vi.mocked(api.activateLicenseHttp).mockRejectedValueOnce({
        response: { data: { detail: 'License key is registered to a different email address.' } },
      });

      const { result } = renderHook(() => useLicense(), { wrapper: LicenseWrapper });
      await waitFor(() => expect(result.current.loading).toBe(false));
      const res = await result.current.activateLicense('any-key');
      expect(res.valid).toBe(false);
      expect(res.error).toContain('registered to a different email');
    });

    it('deactivateLicense resolves without throwing in web mode', async () => {
      const { result } = renderHook(() => useLicense(), { wrapper: LicenseWrapper });
      await waitFor(() => expect(result.current.loading).toBe(false));
      await expect(result.current.deactivateLicense()).resolves.toBeUndefined();
    });

    it('tier stays free after failed activateLicense', async () => {
      const api = await import('../services/api');
      vi.mocked(api.activateLicenseHttp).mockRejectedValueOnce(new Error('bad key'));

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

    it('multiple unknown features all return false (fail-closed)', async () => {
      const { result } = renderHook(() => useLicense(), { wrapper: LicenseWrapper });
      await waitFor(() => expect(result.current.loading).toBe(false));
      ['custom_feature', 'another_feature', 'yet_another'].forEach(f =>
        expect(result.current.isFeatureAllowed(f)).toBe(false)
      );
    });
  });
});
