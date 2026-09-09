import { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import axios from 'axios';
import { registerAuthCallbacks } from '../services/api';
import {
  getAccessToken,
  setAccessToken as setStoreToken,
  clearAccessToken as clearStoreToken,
} from '../services/tokenStore';

const API_BASE = import.meta.env.VITE_API_BASE_URL || 'http://localhost:8000';

interface User {
  id: number;
  email: string;
  first_name: string | null;
  last_name: string | null;
  is_active: boolean;
}

interface AuthState {
  user: User | null;
  token: string | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  register: (email: string, password: string, firstName: string, lastName: string) => Promise<void>;
  logout: () => void;
  setAccessToken: (newToken: string) => void;
}

// eslint-disable-next-line react-refresh/only-export-components
export const AuthContext = createContext<AuthState | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [token, setToken] = useState<string | null>(() => getAccessToken());
  const [loading, setLoading] = useState(true);

  // H-1: tokens are never persisted to localStorage/sessionStorage. The
  // access token lives in module memory only; the refresh token lives in the
  // HttpOnly cookie managed by the backend and is never readable from JS.
  const storeTokens = (accessToken: string, userData: User) => {
    setStoreToken(accessToken);
    setToken(accessToken);
    setUser(userData);
  };

  const clearAuth = () => {
    clearStoreToken();
    setToken(null);
    setUser(null);
  };

  // On mount, silently restore the session via the HttpOnly refresh cookie.
  // No localStorage exists to restore from — the cookie is the session.
  useEffect(() => {
    let cancelled = false;
    const bootstrap = async () => {
      try {
        const res = await axios.post(
          `${API_BASE}/api/v1/auth/refresh`,
          {},
          { withCredentials: true },
        );
        if (cancelled) return;
        const { access_token, user: userData } = res.data;
        if (access_token && userData) {
          storeTokens(access_token, userData);
        } else {
          clearAuth();
        }
      } catch {
        // No valid session (first visit or expired refresh) — stay logged out.
        if (!cancelled) clearAuth();
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    bootstrap();
    return () => {
      cancelled = true;
    };
  }, []);

  const login = async (email: string, password: string) => {
    const form = new URLSearchParams();
    form.append('username', email);
    form.append('password', password);

    const res = await axios.post(`${API_BASE}/api/v1/auth/login`, form, {
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      withCredentials: true,
    });

    const { access_token, user: userData } = res.data;
    if (!access_token || !userData) throw new Error('Login failed');
    storeTokens(access_token, userData);
  };

  const register = async (
    email: string,
    password: string,
    firstName: string,
    lastName: string,
  ) => {
    const res = await axios.post(
      `${API_BASE}/api/v1/auth/register`,
      {
        email,
        password,
        first_name: firstName,
        last_name: lastName,
      },
      { withCredentials: true },
    );

    const { access_token, user: userData } = res.data;
    if (!access_token || !userData) throw new Error('Registration failed');
    storeTokens(access_token, userData);
  };

  const logout = async () => {
    try {
      // Server-side revocation of the refresh token + cookie clear.
      await axios.post(`${API_BASE}/api/v1/auth/logout`, {}, { withCredentials: true });
    } catch {
      // Network/server errors must not keep the client logged in.
    }
    clearAuth();
  };

  const setAccessToken = (newToken: string) => {
    setStoreToken(newToken);
    setToken(newToken);
  };

  // Keep AuthContext in sync with api.ts token refresh lifecycle
  useEffect(() => {
    registerAuthCallbacks({
      onRefreshed: (newToken) => {
        setStoreToken(newToken);
        setToken(newToken);
      },
      onFailed: () => {
        clearAuth();
      },
    });
  }, []);

  return (
    <AuthContext.Provider value={{ user, token, loading, login, register, logout, setAccessToken }}>
      {children}
    </AuthContext.Provider>
  );
}

// eslint-disable-next-line react-refresh/only-export-components
export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
