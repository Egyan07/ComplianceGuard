/*
API Service Layer for ComplianceGuard Frontend

Provides a unified interface that works in two modes:
1. Electron desktop mode - Uses IPC calls via window.electronAPI
2. Web/fallback mode - Uses HTTP API calls (for future SaaS version)

Implementation is split across:
  - api.types.ts  shared request/response types
  - api.http.ts   web-mode HTTP implementation (axios client + endpoints)
  - api.ts        mode detection + Electron IPC implementation + public bridge

Everything is re-exported from here so `import { X } from '../services/api'`
keeps working regardless of which module implements X.
*/

import { getElectronAPI, isElectronMode } from './electron';
import {
  httpCheckHealth,
  httpCollectEvidence,
  httpGetEvidenceItems,
  httpGetEvidenceSummary,
  httpGetScoreTrend,
} from './api.http';
import type {
  ComplianceEvaluation,
  EvaluationHistoryEntry,
  EvidenceCollectionRequest,
  EvidenceCollectionResult,
  EvidenceItem,
  EvidenceSummary,
  TrendPoint,
} from './api.types';

export * from './api.types';
export * from './api.http';

// Detect if running inside Electron
const isElectron = isElectronMode();

// ---- Score Trend ----

/**
 * Returns evaluation history as TrendPoint[], sorted ascending by date.
 * Electron: reads local SQLite via IPC.
 * Web: calls GET /api/v1/compliance/evaluations/history.
 */
export async function getScoreTrend(frameworkId: 1 | 2 | 3 | 4 = 1): Promise<TrendPoint[]> {
  if (isElectron) {
    const api = getElectronAPI();
    const history = await api.getEvaluationHistory(frameworkId);
    if (history && !Array.isArray(history)) return [];
    return evaluationHistoryToTrend(history ?? []);
  }
  return httpGetScoreTrend(frameworkId);
}

// Derive score-trend points from an already-fetched (Electron) evaluation
// history, so callers that also need the raw history don't fetch it twice.
// `findings` arrives as Record<string, unknown> from the preload, so the
// values it contributes are coerced with Number/String rather than cast.
export function evaluationHistoryToTrend(history: EvaluationHistoryEntry[]): TrendPoint[] {
  if (!Array.isArray(history)) return [];
  return history
    .map((r) => ({
      date: r.evaluation_date,
      score: Math.round(Number(r.overall_score ?? r.findings?.overall_score) || 0),
      status: normaliseStatus(r.status ?? String(r.findings?.status ?? '')),
    }))
    .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
}

// Canonical status vocabulary is compliant | partial | non_compliant | not_assessed.
// The legacy synonyms below are mapped defensively for records saved before the
// Phase 5 canonicalization; new evaluations store the canonical strings.
// CG-M2: 'not_assessed' must pass through — an evaluation with nothing
// assessed is NOT a failed (non_compliant) assessment.
export function normaliseStatus(raw: string | undefined): TrendPoint['status'] {
  if (raw === 'compliant') return 'compliant';
  if (raw === 'not_assessed') return 'not_assessed';
  if (raw === 'partial' || raw === 'partial_compliance' || raw === 'at_risk' || raw === 'partially_compliant') return 'partial';
  return 'non_compliant';
}

// ---- Electron IPC implementation ----

async function electronGetEvidenceSummary(frameworkId: 1 | 2 | 3 | 4 = 1): Promise<EvidenceSummary> {
  const api = getElectronAPI();
  const summary = await api.getEvidenceSummary(frameworkId);

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

async function electronGetEvidenceItems(frameworkId: 1 | 2 | 3 | 4 = 1): Promise<EvidenceItem[]> {
  const api = getElectronAPI();
  const items = await api.getEvidenceList(frameworkId);

  if (items && !Array.isArray(items)) throw new Error(items.error ?? 'Failed to load evidence');
  if (!Array.isArray(items)) return [];

  return items.map((item) => ({
    id: String(item.id),
    type: item.evidence_type || 'unknown',
    status: item.status || 'not_assessed',
    data: item.metadata || {},
    timestamp: item.collected_at || new Date().toISOString(),
    source: item.evidence_type || 'local'
  }));
}

async function electronCollectEvidence(frameworkId: 1 | 2 | 3 | 4 = 1): Promise<EvidenceCollectionResult> {
  const api = getElectronAPI();
  return await api.collectWindowsEvidence(frameworkId);
}

async function electronEvaluateCompliance(frameworkId = 1): Promise<ComplianceEvaluation> {
  const api = getElectronAPI();
  const result = await api.evaluateCompliance(frameworkId);
  if (result?.error) throw new Error(result.error);
  return result;
}

// ---- Public API (auto-selects electron vs http) ----

export const getEvidenceSummary = async (frameworkId?: 1 | 2 | 3 | 4): Promise<EvidenceSummary> => {
  if (isElectron) return electronGetEvidenceSummary(frameworkId);
  return httpGetEvidenceSummary();
};

export const getEvidenceItems = async (status?: string, search?: string, frameworkId?: 1 | 2 | 3 | 4): Promise<EvidenceItem[]> => {
  if (isElectron) return electronGetEvidenceItems(frameworkId);
  return httpGetEvidenceItems(status, search);
};

export const collectEvidence = async (
  request?: EvidenceCollectionRequest,
  frameworkId?: 1 | 2 | 3 | 4
): Promise<EvidenceCollectionResult> => {
  if (isElectron) return electronCollectEvidence(frameworkId);
  return httpCollectEvidence(request || {});
};

export const evaluateCompliance = async (frameworkId = 1): Promise<ComplianceEvaluation> => {
  if (isElectron) return electronEvaluateCompliance(frameworkId);
  throw new Error('Compliance evaluation requires the desktop application');
};

export const checkHealth = async (): Promise<Record<string, unknown>> => {
  if (isElectron) {
    const api = getElectronAPI();
    const info = await api.getSystemInfo();
    return { status: 'healthy', service: 'complianceguard-desktop', ...info };
  }
  return httpCheckHealth();
};

// ---- Empty-state fallback (used when the evidence query fails) ----

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
