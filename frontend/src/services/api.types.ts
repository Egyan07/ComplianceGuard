/*
Shared types for the frontend API service layer. Re-exported from
services/api.ts so existing `import { X } from '../services/api'` sites keep
working.
*/

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

export interface ControlResult {
  status: 'compliant' | 'non_compliant' | 'partial' | 'not_assessed';
  score: number;           // 0–100
  gaps: string[];          // missing evidence type IDs
  available_evidence: string[];
  recommendation?: string;
}

export interface ComplianceEvaluation {
  framework_id: number | string; // numeric on desktop (1-4), canonical id string on web
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
  control_results: Record<string, ControlResult> | null;
  recommendations: Array<Record<string, any>>;
}

// ---- Score Trend ----

export interface TrendPoint {
  date: string;          // ISO 8601 — always chronologically ascending (invariant enforced by getScoreTrend)
  score: number;         // 0–100
  status: 'compliant' | 'partial' | 'non_compliant';
}

export interface TrendDisplayPoint extends TrendPoint {
  formattedDate: string;  // e.g. "Jun 1"
  statusLabel: string;    // "Good Standing" | "On Track" | "Needs Attention"
  delta?: number;         // undefined for first point; thisScore - previousScore for rest
}

// ---- Evaluation history (shared record shapes) ----

/** A recommendation produced by the canonical engines (Python + Electron). */
export interface Recommendation {
  control_id: string;
  priority: string; // 'high' | 'medium' (string so legacy rows stay valid)
  recommendation: string;
  evidence_needed?: string[];
}

/**
 * Electron evaluation-history row. `findings` is deliberately the same
 * untyped shape the preload exposes (Record<string, unknown>); consumers that
 * read fields from it coerce values locally.
 */
export interface EvaluationHistoryEntry {
  id: number;
  framework_id: number;
  evaluation_date: string;
  overall_score: number;
  status: string;
  findings?: Record<string, unknown>;
}

/** Row returned by the web /compliance/evaluations/history endpoint. */
export interface HttpEvaluationRecord {
  framework_id: string | number;
  overall_score?: number;
  compliance_status?: string;
  status?: string;
  evaluation_date?: string;
}

/** Web /evidence/items row. */
export interface HttpEvidenceItem {
  id: number | string;
  evidence_type?: string;
  status?: string;
  data?: Record<string, unknown>;
  created_at?: string;
  source?: string;
}

/** Web evaluate-from-evidence response (canonical 0-100 contract). */
export interface HttpEvaluationResponse {
  framework_id: string;
  evaluation_date: string;
  overall_score: number;
  compliance_status: string;
  compliance_level?: string;
  control_count: number;
  compliant_controls: number;
  partial_controls?: number;
  non_compliant_controls?: number;
  not_assessed_controls?: number;
  recommendations?: Recommendation[];
}

/**
 * Web license-info / activate-license payload. The backend returns snake_case;
 * camelCase variants are accepted for resilience.
 */
export interface LicenseInfoPayload {
  tier?: string;
  license_id?: string | null;
  licenseId?: string | null;
  email?: string | null;
  max_machines?: number | null;
  maxMachines?: number | null;
  expires_at?: string | null;
  expiresAt?: string | null;
  days_remaining?: number | null;
  daysRemaining?: number | null;
  is_expired?: boolean;
  isExpired?: boolean;
  is_grace_period?: boolean;
  isGracePeriod?: boolean;
}

// ---- Enterprise (desktop IPC payloads) ----

/** One row of the remediation plan (owner + target date per control). */
export interface RemediationRow {
  control_id: string;
  owner: string;
  target_date: string;
  notes?: string;
}

/** One audit-log entry rendered in the Enterprise panel. */
export interface AuditEntry {
  id: number;
  event_type: string;
  framework?: string | null;
  score?: number | null;
  created_at: string;
}

// ---- Cloud Dashboard ----

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
