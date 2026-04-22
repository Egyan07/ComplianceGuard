/*
API Service Layer for ComplianceGuard Frontend

Provides a unified interface that works in two modes:
1. Electron desktop mode - Uses IPC calls via window.electronAPI
2. Web/fallback mode - Uses HTTP API calls (for future SaaS version)
*/

import axios, { AxiosInstance } from 'axios';

// Detect if running inside Electron
const isElectron = !!(window as any).electronAPI;

// HTTP client for web/fallback mode
const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:8000/api/v1';

const apiClient: AxiosInstance = axios.create({
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
      const storedRefresh = localStorage.getItem('refresh_token');

      if (!storedRefresh) {
        localStorage.removeItem('auth_token');
        return Promise.reject(error);
      }

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
        const refreshRes = await axios.post(
          `${import.meta.env.VITE_API_BASE_URL || 'http://localhost:8000'}/api/auth/refresh`,
          { refresh_token: storedRefresh },
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
        localStorage.removeItem('refresh_token');
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

// TypeScript interfaces

export interface ComplianceMetrics {
  s3_encryption_compliance: number;
  iam_policy_compliance: number;
  overall_compliance_score: number;
}

export interface EvidenceSummary {
  total_collections: number;
  last_collection: string | null;
  compliance_metrics: ComplianceMetrics;
}

export interface EvidenceItem {
  id: string;
  type: string;
  status: string;
  data: Record<string, any>;
  timestamp: string;
  source: string;
}

export interface EvidenceCollectionRequest {
  collection_types?: string[];
}

export interface EvidenceCollectionResult {
  success?: boolean;
  error?: string;
  evidence_count?: number;
}

export interface ComplianceEvaluation {
  framework_id: number;
  framework_name: string;
  evaluation_date: string;
  overall_score: number;
  status: string;
  tier?: string;
  total_controls: number;
  compliant_controls: number;
  non_compliant_controls: number;
  partial_controls: number;
  not_assessed_controls: number;
  category_scores: Record<string, any> | null;
  control_results: Record<string, any> | null;
  recommendations: Array<Record<string, any>>;
}

// ---- Electron IPC API ----

function getElectronAPI(): any {
  return (window as any).electronAPI;
}

async function electronGetEvidenceSummary(): Promise<EvidenceSummary> {
  const api = getElectronAPI();
  const summary = await api.getEvidenceSummary(1);

  if (summary?.error) throw new Error(summary.error);

  // Transform electron summary format to frontend format
  return {
    total_collections: summary.total_evidence || 0,
    last_collection: summary.recent_evidence?.[0]?.collected_at || null,
    compliance_metrics: {
      s3_encryption_compliance: 0,
      iam_policy_compliance: 0,
      overall_compliance_score: 0
    }
  };
}

async function electronGetEvidenceItems(): Promise<EvidenceItem[]> {
  const api = getElectronAPI();
  const items = await api.getEvidenceList(1);

  if (items?.error) throw new Error(items.error);
  if (!Array.isArray(items)) return [];

  return items.map((item: any) => ({
    id: String(item.id),
    type: item.evidence_type || 'unknown',
    status: mapControlStatus(item),
    data: item.metadata || {},
    timestamp: item.collected_at || new Date().toISOString(),
    source: item.evidence_type || 'local'
  }));
}

async function electronCollectEvidence(): Promise<EvidenceCollectionResult> {
  const api = getElectronAPI();
  return await api.collectWindowsEvidence(1);
}

async function electronEvaluateCompliance(): Promise<ComplianceEvaluation> {
  const api = getElectronAPI();
  const result = await api.evaluateCompliance(1);
  if (result?.error) throw new Error(result.error);
  return result;
}

function mapControlStatus(item: any): string {
  // Map evidence to a simple status for display
  if (!item) return 'unknown';
  if (item.evidence_type === 'event_logs' || item.evidence_type === 'system_configs') return 'compliant';
  if (item.evidence_type === 'security_policies') return 'compliant';
  return 'compliant';
}

// ---- HTTP API (fallback for web mode) ----

async function httpGetEvidenceSummary(): Promise<EvidenceSummary> {
  const response = await apiClient.get('/evidence/summary');
  return response.data;
}

async function httpCollectEvidence(request: EvidenceCollectionRequest): Promise<EvidenceCollectionResult> {
  const response = await apiClient.post('/evidence/collect', request);
  return response.data;
}

// ---- Public API (auto-selects electron vs http) ----

export const getEvidenceSummary = async (): Promise<EvidenceSummary> => {
  if (isElectron) return electronGetEvidenceSummary();
  return httpGetEvidenceSummary();
};

export const getEvidenceItems = async (): Promise<EvidenceItem[]> => {
  if (isElectron) return electronGetEvidenceItems();
  return getMockEvidenceItems(); // Web mode falls back to mock for now
};

export const collectEvidence = async (
  request?: EvidenceCollectionRequest
): Promise<EvidenceCollectionResult> => {
  if (isElectron) return electronCollectEvidence();
  return httpCollectEvidence(request || {});
};

export const evaluateCompliance = async (): Promise<ComplianceEvaluation> => {
  if (isElectron) return electronEvaluateCompliance();
  throw new Error('Compliance evaluation requires the desktop application');
};

export const checkHealth = async (): Promise<Record<string, any>> => {
  if (isElectron) {
    const api = getElectronAPI();
    const info = await api.getSystemInfo();
    return { status: 'healthy', service: 'complianceguard-desktop', ...info };
  }
  const response = await axios.get('http://localhost:8000/health');
  return response.data;
};

// ---- Mock data (used when no backend/electron available) ----

export const getMockEvidenceSummary = (): EvidenceSummary => {
  return {
    total_collections: 0,
    last_collection: null,
    compliance_metrics: {
      s3_encryption_compliance: 0,
      iam_policy_compliance: 0,
      overall_compliance_score: 0
    }
  };
};

export const getMockEvidenceItems = (): EvidenceItem[] => {
  if (isElectron) return []; // In electron mode, return empty - real data comes from IPC
  return [
    {
      id: 'demo_1',
      type: 's3_encryption',
      status: 'compliant',
      data: { bucket_name: 'secure-data-bucket', encryption: 'AES256' },
      timestamp: '2024-01-15T10:30:00Z',
      source: 'aws_s3'
    },
    {
      id: 'demo_2',
      type: 'iam_policy',
      status: 'warning',
      data: { policy_name: 'admin-policy', risk_level: 'medium' },
      timestamp: '2024-01-15T10:25:00Z',
      source: 'aws_iam'
    },
    {
      id: 'demo_3',
      type: 's3_encryption',
      status: 'non_compliant',
      data: { bucket_name: 'legacy-bucket', encryption: 'none' },
      timestamp: '2024-01-15T10:20:00Z',
      source: 'aws_s3'
    }
  ];
};

// ---- License HTTP (web mode) ----

export async function getLicenseInfoHttp(): Promise<any> {
  const token = localStorage.getItem('auth_token');
  if (!token) return { tier: 'free' };
  const base = (import.meta.env.VITE_API_BASE_URL || 'http://localhost:8000').replace(/\/api\/v1$/, '');
  const url = `${base}/api/auth/license-info`;
  const res = await axios.get(url, { headers: { Authorization: `Bearer ${token}` } });
  return res.data;
}

export async function activateLicenseHttp(licenseKey: string): Promise<any> {
  const token = localStorage.getItem('auth_token');
  if (!token) throw new Error('Not authenticated');
  const base = (import.meta.env.VITE_API_BASE_URL || 'http://localhost:8000').replace(/\/api\/v1$/, '');
  const url = `${base}/api/auth/activate-license`;
  const res = await axios.post(
    url,
    { license_key: licenseKey },
    { headers: { Authorization: `Bearer ${token}` } }
  );
  return res.data;
}

// ---- Cloud Dashboard types ----

export interface FleetStats {
  total_machines: number;
  compliant: number;
  at_risk: number;
  critical: number;
  never_synced: number;
  avg_score: number | null;
  machine_limit: number | null;
}

export interface MachineRecord {
  id: number;
  hostname: string;
  os_version: string | null;
  last_score: number | null;
  compliance_level: string | null;
  evidence_count: number | null;
  last_sync_at: string | null;
  is_active: boolean;
  created_at: string;
}

export async function getFleetStats(): Promise<FleetStats> {
  const response = await apiClient.get('/machines/fleet-stats');
  return response.data;
}

export async function getMachines(): Promise<MachineRecord[]> {
  const response = await apiClient.get('/machines');
  return response.data;
}
