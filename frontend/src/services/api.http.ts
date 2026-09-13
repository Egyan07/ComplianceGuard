/*
HTTP implementation of the API service layer (web mode). Re-exported from
services/api.ts so existing imports keep working.
*/

import axios, { AxiosInstance, InternalAxiosRequestConfig } from 'axios';
import type {
  ComplianceEvaluation,
  EvidenceCollectionRequest,
  EvidenceCollectionResult,
  EvidenceItem,
  EvidenceSummary,
  FleetStats,
  HttpEvaluationRecord,
  HttpEvaluationResponse,
  HttpEvidenceCollectionResponse,
  HttpEvidenceItem,
  LicenseInfoPayload,
  MachineRecord,
} from './api.types';

// Axios config extended with our one-shot retry marker.
type RetryableRequest = InternalAxiosRequestConfig & { _retried?: boolean };
import { normaliseStatus } from './api';
import {
  getAccessToken,
  setAccessToken as setStoreToken,
  clearAccessToken as clearStoreToken,
} from './tokenStore';

// HTTP client for web/fallback mode
const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:8000/api/v1';

export const apiClient: AxiosInstance = axios.create({
  baseURL: API_BASE_URL,
  timeout: 10000,
  headers: { 'Content-Type': 'application/json' },
  // Send/accept cookies so the HttpOnly refresh cookie survives cross-port dev.
  withCredentials: true,
});

// H-1: the access token is held in memory only (tokenStore) — it is never
// read from or written to localStorage/sessionStorage.
apiClient.interceptors.request.use((config) => {
  const token = getAccessToken();
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
    const originalRequest = error.config as RetryableRequest | undefined;
    if (!originalRequest) return Promise.reject(error);

    // Only attempt refresh on 401, not on the refresh endpoint itself, and only once per request
    if (
      error.response?.status === 401 &&
      !originalRequest._retried &&
      !originalRequest.url?.includes('/auth/refresh')
    ) {
      originalRequest._retried = true;

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
        setStoreToken(newAccessToken); // memory only — no persistent storage
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
        clearStoreToken(); // memory only — nothing persisted to clear
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
  const response = await apiClient.post<HttpEvidenceCollectionResponse>('/evidence/collect', request);
  const data = response.data ?? {};
  // CG-M3: surface the real collection status. A 200 with status
  // 'not_configured' or 'partial_failure' is NOT a successful collection —
  // the caller must not announce "collection complete!".
  return {
    success: data.status === 'success',
    collection_status: data.status,
    evidence_count: data.evidence_count,
    failed_count: data.failed_count,
  };
}

export async function httpGetEvidenceItems(status?: string, search?: string): Promise<EvidenceItem[]> {
  const params = new URLSearchParams();
  if (status) params.set('status', status);
  if (search) params.set('search', search);
  const qs = params.toString();
  const response = await apiClient.get<HttpEvidenceItem[]>(`/evidence/items${qs ? '?' + qs : ''}`);
  return (response.data ?? []).map((item) => ({
    id: String(item.id),
    type: item.evidence_type ?? 'unknown',
    status: item.status ?? 'not_assessed',
    data: item.data ?? {},
    timestamp: item.created_at ?? new Date().toISOString(),
    source: item.source ?? 'unknown',
  }));
}

// The backend persists framework IDs as taxonomy strings ('soc2_v2017',
// 'iso27001_v2022', 'hipaa_security_rule', 'gdpr_2016_679') — NOT numbers.
// Legacy numeric rows (1-4) from the earliest schema are mapped too.
export const FRAMEWORK_ID_STRINGS: Record<1 | 2 | 3 | 4, string[]> = {
  1: ['soc2'],
  2: ['iso27001'],
  3: ['hipaa'],
  4: ['gdpr'],
};

export function frameworkIdMatches(recordId: string | number | null | undefined, frameworkId: 1 | 2 | 3 | 4): boolean {
  const raw = String(recordId ?? '').toLowerCase();
  if (!raw) return false;
  if (FRAMEWORK_ID_STRINGS[frameworkId].some((prefix) => raw.startsWith(prefix))) return true;
  const numeric = Number(recordId);
  return Number.isFinite(numeric) && numeric === frameworkId;
}

export async function httpGetScoreTrend(frameworkId: 1 | 2 | 3 | 4): Promise<Array<{
  date: string;
  score: number;
  status: 'compliant' | 'partial' | 'non_compliant' | 'not_assessed';
}>> {
  const response = await apiClient.get<HttpEvaluationRecord[]>('/compliance/evaluations/history');
  const rows: HttpEvaluationRecord[] = response.data ?? [];
  return rows
    .filter((r) => frameworkIdMatches(r.framework_id, frameworkId))
    .map((r) => ({
      date: r.evaluation_date ?? '',
      // Canonical contract: overall_score is 0-100 on both web and desktop.
      score: Math.round(r.overall_score ?? 0),
      status: normaliseStatus(r.compliance_status ?? r.status),
      taxonomyVersion: r.taxonomy_version ?? null,
    }))
    .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
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
    2: 'ISO/IEC 27001:2022',
    3: 'HIPAA Security Rule',
    4: 'GDPR',
  };
  const response = await apiClient.post<HttpEvaluationResponse>(urls[frameworkId] ?? urls[1]);
  const d = response.data;
  return {
    framework_id: d.framework_id,
    framework_name: frameworkNames[frameworkId] ?? 'SOC 2 Type II',
    evaluation_date: d.evaluation_date,
    // Canonical contract: overall_score is 0-100 from the API.
    overall_score: Math.round(d.overall_score ?? 0),
    status: d.compliance_status,
    tier: 'web',
    total_controls: d.control_count,
    compliant_controls: d.compliant_controls,
    // Canonical contract: the API returns the real control-status counts.
    // Fallbacks keep pre-fix persisted records (which lacked them) sane.
    non_compliant_controls: d.non_compliant_controls ?? d.control_count - d.compliant_controls,
    partial_controls: d.partial_controls ?? 0,
    not_assessed_controls: d.not_assessed_controls ?? 0,
    category_scores: null,
    control_results: null,
    recommendations: d.recommendations ?? [],
  };
}

export async function httpCheckHealth(): Promise<Record<string, unknown>> {
  const response = await axios.get('http://localhost:8000/health');
  return response.data;
}

// ---- License HTTP (web mode) ----

export async function getLicenseInfoHttp(): Promise<LicenseInfoPayload> {
  const token = getAccessToken();
  if (!token) return { tier: 'free' };
  const base = (import.meta.env.VITE_API_BASE_URL || 'http://localhost:8000').replace(/\/api\/v1$/, '');
  const url = `${base}/api/v1/auth/license-info`;
  const res = await axios.get(url, {
    headers: { Authorization: `Bearer ${token}` },
    withCredentials: true,
  });
  return res.data;
}

export async function activateLicenseHttp(licenseKey: string): Promise<LicenseInfoPayload> {
  const token = getAccessToken();
  if (!token) throw new Error('Not authenticated');
  const base = (import.meta.env.VITE_API_BASE_URL || 'http://localhost:8000').replace(/\/api\/v1$/, '');
  const url = `${base}/api/v1/auth/activate-license`;
  const res = await axios.post(
    url,
    { license_key: licenseKey },
    {
      headers: { Authorization: `Bearer ${token}` },
      withCredentials: true,
    }
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

// ---- Web manual evidence upload ----

export interface WebEvidenceUploadRequest {
  file?: File;
  /** Text-evidence mode: raw content is wrapped into a .txt file client-side
      so the backend keeps ONE upload/persistence path (multipart). */
  textContent?: string;
  evidenceType: string;
  title: string;
  description?: string;
  controlId?: string;
  frameworkId?: 1 | 2 | 3 | 4;
}

/**
 * Web-mode manual evidence upload → POST /evidence/upload (multipart).
 * Mirrors the desktop IPC payload: control mapping and framework ride along
 * as metadata; scoring maps via evidence_type only (canonical contract).
 */
export async function uploadEvidenceFileWeb(req: WebEvidenceUploadRequest): Promise<{ evidence_item_id: number }> {
  const form = new FormData();

  if (req.file) {
    form.append('file', req.file, req.file.name);
  } else if (typeof req.textContent === 'string') {
    const safeTitle = (req.title || 'evidence').replace(/[^A-Za-z0-9._-]/g, '_').slice(0, 64);
    const blob = new Blob([req.textContent], { type: 'text/plain' });
    form.append('file', blob, `${safeTitle || 'evidence'}.txt`);
  } else {
    throw new Error('No file or text content provided.');
  }

  form.append('evidence_type', req.evidenceType);
  form.append('title', req.title);
  if (req.description) form.append('description', req.description);
  if (req.controlId) form.append('control_id', req.controlId);
  if (req.frameworkId) form.append('framework_id', String(req.frameworkId));

  const response = await apiClient.post('/evidence/upload', form, {
    headers: { 'Content-Type': 'multipart/form-data' },
  });
  return response.data;
}

// ---- Web evaluation history (History page, web mode) ----

/**
 * Fetch the user's persisted evaluation records for the History page in web
 * mode. Rows are normalised into the same shape the Electron IPC history
 * returns so EvaluationHistory renders one code path.
 */
export async function httpGetEvaluationHistory(frameworkId: 1 | 2 | 3 | 4): Promise<HttpEvaluationRecord[]> {
  const response = await apiClient.get<HttpEvaluationRecord[]>('/compliance/evaluations/history');
  return (response.data ?? []).filter((r) => frameworkIdMatches(r.framework_id, frameworkId));
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
