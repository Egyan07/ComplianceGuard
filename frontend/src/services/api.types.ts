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
