/*
HTTP implementation of the API service layer (web mode). Re-exported from
services/api.ts so existing imports keep working.
*/

import axios, { AxiosInstance } from 'axios';
import type {
  EvidenceCollectionRequest,
  EvidenceCollectionResult,
  EvidenceItem,
  EvidenceSummary,
  FleetStats,
  MachineRecord,
  ComplianceEvaluation,
} from './api.types';

// HTTP client for web/fallback mode
const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:8000/api/v1';

export const apiClient: AxiosInstance = axios.create({
  baseURL: API_BASE_URL,
  timeout: 10000,
  headers: { 'Content-Type': 'application/json' },
});

apiClient.interceptors.request.use((config) => {
  const token = localStorage.getItem('auth_token');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// Auth callback hooks — registered by AuthContext to keep React state in sync
let onTokenRefreshed: ((token: string) => void) | null = null;
let onRefreshFailed: (() => void) | null = null;

export function registerAuthCallbacks(opts: {
  onRefreshed: (t: string) => void;
  onFailed: () => void;
}) {
  onTokenRefreshed = opts.onRefreshed;
  onRefreshFailed = opts.onFailed;
}

// Track whether a refresh is already in-flight to avoid parallel refresh loops
let isRefreshing = false;
interface PendingRequest {
  onSuccess: (token: string) => void;
  onFailure: (error: unknown) => void;
}
let pendingRequests: PendingRequest[] = [];

apiClient.interceptors.response.use(
  (response) => response,
  async (error) => {
    const originalRequest = error.config;

    // Only attempt refresh on 401, not on the refresh endpoint itself, and only once per request
    if (
      error.response?.status === 401 &&
      !(originalRequest as any)._retried &&
      !originalRequest.url?.includes('/auth/refresh')
    ) {
      (originalRequest as any)._retried = true;

      if (isRefreshing) {
        // Queue this request until the in-flight refresh completes or fails
        return new Promise((resolve, reject) => {
          pendingRequests.push({
            onSuccess: (newToken: string) => {
              originalRequest.headers.Authorization = `Bearer ${newToken}`;
              resolve(apiClient(originalRequest));
            },
            onFailure: reject,
          });
        });
      }

      isRefreshing = true;

      try {
        // The refresh token rides the HttpOnly cookie (same-origin), so no body
        // is sent; withCredentials ensures the cookie is included.
        const refreshRes = await axios.post(
          `${import.meta.env.VITE_API_BASE_URL || 'http://localhost:8000'}/api/v1/auth/refresh`,
          {},
          { withCredentials: true },
        );
        const newAccessToken: string = refreshRes.data.access_token;
        localStorage.setItem('auth_token', newAccessToken);
        onTokenRefreshed?.(newAccessToken);

        // Replay all queued requests with the new token
        pendingRequests.forEach(({ onSuccess }) => onSuccess(newAccessToken));
        pendingRequests = [];

        originalRequest.headers.Authorization = `Bearer ${newAccessToken}`;
        return apiClient(originalRequest);
      } catch {
        // Refresh failed — reject all queued requests and clear auth
        pendingRequests.forEach(({ onFailure }) => onFailure(error));
        pendingRequests = [];
        localStorage.removeItem('auth_token');
        localStorage.removeItem('auth_user');
        onRefreshFailed?.();
        return Promise.reject(error);
      } finally {
        isRefreshing = false;
      }
    }

    return Promise.reject(error);
  },
);

// ---- HTTP implementations ----

export async function httpGetEvidenceSummary(): Promise<EvidenceSummary> {
  const response = await apiClient.get('/evidence/summary');
  return response.data;
}

export async function httpCollectEvidence(request: EvidenceCollectionRequest): Promise<EvidenceCollectionResult> {
  const response = await apiClient.post('/evidence/collect', request);
  return response.data;
}

export async function httpGetEvidenceItems(status?: string, search?: string): Promise<EvidenceItem[]> {
  const params = new URLSearchParams();
  if (status) params.set('status', status);
  if (search) params.set('search', search);
  const qs = params.toString();
  const response = await apiClient.get(`/evidence/items${qs ? '?' + qs : ''}`);
  return (response.data as any[]).map((item: any) => ({
    id: String(item.id),
    type: item.evidence_type,
    status: item.status,
    data: item.data || {},
    timestamp: item.created_at,
    source: item.source,
  }));
}

export async function httpGetScoreTrend(frameworkId: 1 | 2 | 3 | 4): Promise<Array<{
  date: string;
  score: number;
  status: 'compliant' | 'partial' | 'non_compliant';
}>> {
  const response = await apiClient.get('/compliance/evaluations/history');
  const rows: any[] = response.data ?? [];
  return rows
    .filter((r: any) => Number(r.framework_id) === frameworkId)
    .map((r: any) => ({
      date: r.evaluation_date,
      score: Math.round((r.overall_score ?? 0) * (r.overall_score <= 1 ? 100 : 1)),
      status: normaliseStatus(r.compliance_status ?? r.status),
    }))
    .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
}

function normaliseStatus(raw: string | undefined): 'compliant' | 'partial' | 'non_compliant' {
  if (raw === 'compliant') return 'compliant';
  if (raw === 'partial' || raw === 'partial_compliance' || raw === 'at_risk') return 'partial';
  return 'non_compliant';
}

export async function evaluateComplianceWeb(frameworkId = 1): Promise<ComplianceEvaluation> {
  const urls: Record<number, string> = {
    1: '/compliance/evaluate-from-evidence',
    2: '/iso27001/evaluate-from-evidence',
    3: '/hipaa/evaluate-from-evidence',
    4: '/gdpr/evaluate-from-evidence',
  };
  const frameworkNames: Record<number, string> = {
    1: 'SOC 2 Type II',
    2: 'ISO 27001:2013',
    3: 'HIPAA Security Rule',
    4: 'GDPR',
  };
  const response = await apiClient.post(urls[frameworkId] ?? urls[1]);
  const d = response.data;
  return {
    framework_id: d.framework_id,
    framework_name: frameworkNames[frameworkId] ?? 'SOC 2 Type II',
    evaluation_date: d.evaluation_date,
    overall_score: (d.overall_score ?? 0) * 100,
    status: d.compliance_status,
    tier: 'web',
    total_controls: d.control_count,
    compliant_controls: d.compliant_controls,
    non_compliant_controls: d.control_count - d.compliant_controls,
    partial_controls: 0,
    not_assessed_controls: 0,
    category_scores: null,
    control_results: null,
    recommendations: d.recommendations ?? [],
  };
}

export async function httpCheckHealth(): Promise<Record<string, any>> {
  const response = await axios.get('http://localhost:8000/health');
  return response.data;
}

// ---- License HTTP (web mode) ----

export async function getLicenseInfoHttp(): Promise<any> {
  const token = localStorage.getItem('auth_token');
  if (!token) return { tier: 'free' };
  const base = (import.meta.env.VITE_API_BASE_URL || 'http://localhost:8000').replace(/\/api\/v1$/, '');
  const url = `${base}/api/v1/auth/license-info`;
  const res = await axios.get(url, { headers: { Authorization: `Bearer ${token}` } });
  return res.data;
}

export async function activateLicenseHttp(licenseKey: string): Promise<any> {
  const token = localStorage.getItem('auth_token');
  if (!token) throw new Error('Not authenticated');
  const base = (import.meta.env.VITE_API_BASE_URL || 'http://localhost:8000').replace(/\/api\/v1$/, '');
  const url = `${base}/api/v1/auth/activate-license`;
  const res = await axios.post(
    url,
    { license_key: licenseKey },
    { headers: { Authorization: `Bearer ${token}` } }
  );
  return res.data;
}

// ---- Email verification / password reset (public, token-based, no auth) ----

function authApiBase(): string {
  return (import.meta.env.VITE_API_BASE_URL || 'http://localhost:8000').replace(/\/api\/v1$/, '');
}

export async function verifyEmailHttp(token: string): Promise<{ message: string }> {
  const res = await axios.post(`${authApiBase()}/api/v1/auth/verify-email`, { token });
  return res.data;
}

export async function resetPasswordHttp(token: string, newPassword: string): Promise<{ message: string }> {
  const res = await axios.post(`${authApiBase()}/api/v1/auth/reset-password`, {
    token,
    new_password: newPassword,
  });
  return res.data;
}

// ---- Cloud Dashboard ----

export async function getFleetStats(): Promise<FleetStats> {
  const response = await apiClient.get('/machines/fleet-stats');
  return response.data;
}

export async function getMachines(): Promise<MachineRecord[]> {
  const response = await apiClient.get('/machines');
  return response.data;
}
