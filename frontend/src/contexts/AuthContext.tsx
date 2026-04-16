import { createContext, useContext, useState, useEffect, useRef, ReactNode } from 'react';
import axios from 'axios';

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
}

const AuthContext = createContext<AuthState | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [token, setToken] = useState<string | null>(() => localStorage.getItem('auth_token'));
  const [loading, setLoading] = useState(true);
  // Ref so the axios interceptor in api.ts always reads the latest refresh token
  const refreshTokenRef = useRef<string | null>(localStorage.getItem('refresh_token'));

  const storeTokens = (accessToken: string, refreshToken: string, userData: User) => {
    setToken(accessToken);
    setUser(userData);
    refreshTokenRef.current = refreshToken;
    localStorage.setItem('auth_token', accessToken);
    localStorage.setItem('refresh_token', refreshToken);
    localStorage.setItem('auth_user', JSON.stringify(userData));
  };

  const clearAuth = () => {
    setToken(null);
    setUser(null);
    refreshTokenRef.current = null;
    localStorage.removeItem('auth_token');
    localStorage.removeItem('refresh_token');
    localStorage.removeItem('auth_user');
  };

  // On mount, restore session from localStorage
  useEffect(() => {
    const storedToken = localStorage.getItem('auth_token');
    const storedUser = localStorage.getItem('auth_user');
    const storedRefresh = localStorage.getItem('refresh_token');
    if (storedToken && storedUser) {
      try {
        setToken(storedToken);
        setUser(JSON.parse(storedUser));
        refreshTokenRef.current = storedRefresh;
      } catch {
        clearAuth();
      }
    }
    setLoading(false);
  }, []);

  const login = async (email: string, password: string) => {
    const form = new URLSearchParams();
    form.append('username', email);
    form.append('password', password);

    const res = await axios.post(`${API_BASE}/api/auth/login`, form, {
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    });

    const { access_token, refresh_token, user: userData } = res.data;
    storeTokens(access_token, refresh_token, userData);
  };

  const register = async (
    email: string,
    password: string,
    firstName: string,
    lastName: string,
  ) => {
    const res = await axios.post(`${API_BASE}/api/auth/register`, {
      email,
      password,
      first_name: firstName,
      last_name: lastName,
    });

    const { access_token, refresh_token, user: userData } = res.data;
    storeTokens(access_token, refresh_token, userData);
  };

  const logout = () => clearAuth();

  return (
    <AuthContext.Provider value={{ user, token, loading, login, register, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
