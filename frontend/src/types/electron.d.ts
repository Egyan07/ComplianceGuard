/**
 * Type surface for the Electron preload bridge exposed on `window.electronAPI`.
 * The preload script lives at electron/preload.js; this file types every IPC
 * channel the React code consumes so the renderer never has to cast `window`
 * to `any`. Access it through `services/electron.ts` (`getElectronAPI()`).
 *
 * If you add a new IPC channel in preload.js that the renderer calls, add
 * its signature here too.
 */

import type { LicenseInfo } from '../contexts/LicenseContext';
import type { ControlResult } from '../services/api';

export interface ElectronLicenseAPI {
  getLicenseInfo: () => Promise<LicenseInfo>;
  activateLicense: (key: string) => Promise<{
    valid: boolean;
    error?: string;
    payload?: LicenseInfo;
    tier?: 'free' | 'pro' | 'enterprise';
  }>;
  deactivateLicense: () => Promise<void>;
  onLicenseChanged?: (handler: (info: LicenseInfo) => void) => (() => void) | undefined;
}

export interface ScheduleConfig {
  enabled: boolean;
  frequency: 'daily' | 'weekly';
  time: string;
}

export interface CollectionResult {
  success: boolean;
  evidence_count: number;
  ran_at: string;
  error?: string;
}

export interface ScheduleState {
  config: ScheduleConfig;
  last_run_at: string | null;
  next_run_at: string | null;
  last_result: CollectionResult | null;
}

export interface FrameworkControl {
  id: string;
  title: string;
  description: string;
  category: string;
  control_objective: string;
  implementation_guidance: string;
  risk_level?: 'low' | 'medium' | 'high';
  specification_type?: 'required' | 'addressable';
  chapter?: string;
  related_controls?: string[];
}

export interface FrameworkData {
  frameworkId: number;
  name: string;
  controls: FrameworkControl[];
}

export interface FrameworkDataError {
  error: string;
}

export interface ComplianceEvaluationResult {
  framework_id: number;
  framework_name: string;
  overall_score: number;
  status: 'compliant' | 'partial' | 'non_compliant';
  total_controls: number;
  compliant_controls: number;
  non_compliant_controls: number;
  partial_controls: number;
  not_assessed_controls: number;
  id: number;
  tier: string;
  category_scores: Record<string, { score: number; weight: number; control_count: number }> | null;
  control_results: Record<string, ControlResult> | null;
  recommendations: Array<{ control_id: string; priority: string; recommendation: string; evidence_needed: string[] }>;
  evaluation_date: string;
  error?: string;
}

export interface SystemInfo {
  platform: string;
  arch: string;
  version: string;
  electronVersion: string;
}

export interface CloudSyncConfig {
  connected: boolean;
  serverUrl: string | null;
  email: string | null;
}

export interface EvidenceFileSelection {
  fileName: string;
  filePath: string;
  fileSize: number;
  fileData: string; // base64
}

export interface EnterpriseConfig {
  company_name: string | null;
  logo_path: string | null;
  report_footer: string | null;
  system_description?: string | null;
  report_type?: string | null;
  period_start?: string | null;
  period_end?: string | null;
  error?: string;
}

export interface RemediationPlanResult {
  plan?: Record<string, unknown>;
  error?: string;
}

export interface AuditLogResult {
  total?: number;
  page?: number;
  pageSize?: number;
  entries?: Array<Record<string, unknown>>;
  error?: string;
}

export interface EvidenceSummaryResult {
  error?: string;
  total_evidence?: number;
  recent_evidence?: Array<{ collected_at?: string }>;
}

export interface EvidenceListRow {
  id: number | string;
  evidence_type?: string;
  status?: string;
  metadata?: unknown;
  collected_at?: string;
}

export interface EvidenceCollectionResultIPC {
  success?: boolean;
  error?: string;
  evidence_count?: number;
}

export interface ManualEvidenceResult {
  success?: boolean;
  evidence_id?: number;
  error?: string;
  upgrade_required?: boolean;
}

export interface ElectronAPI extends ElectronLicenseAPI {
  // App info
  getAppVersion: () => Promise<string>;
  getSystemInfo: () => Promise<SystemInfo>;

  // User settings
  getUserSetting: (key: string, defaultValue?: unknown) => Promise<unknown>;
  setUserSetting: (key: string, value: unknown, type?: string) => Promise<{ success?: boolean; error?: string }>;

  // Cloud sync
  cloudGetConfig: () => Promise<CloudSyncConfig>;
  cloudConnect: (
    serverUrl: string,
    email: string,
    password: string,
  ) => Promise<CloudSyncConfig | { error: string }>;
  cloudSync: (syncData: unknown) => Promise<{ success?: boolean; error?: string }>;
  cloudDisconnect: () => Promise<{ success?: boolean; error?: string }>;

  // Evidence
  getEvidenceSummary: (frameworkId?: number) => Promise<EvidenceSummaryResult>;
  getEvidenceList: (frameworkId?: number) => Promise<{ error?: string } | EvidenceListRow[]>;
  collectWindowsEvidence: (frameworkId?: number) => Promise<EvidenceCollectionResultIPC>;
  processManualEvidence: (evidenceData: unknown, frameworkId?: number) => Promise<ManualEvidenceResult>;
  selectEvidenceFile: () => Promise<EvidenceFileSelection | null>;

  // Scheduling
  getSchedule: () => Promise<ScheduleState>;
  setSchedule: (config: ScheduleConfig) => Promise<{ config: ScheduleConfig; next_run_at: string | null } | { error: string }>;
  runCollectionNow: () => Promise<CollectionResult | { error: string }>;

  // Reports / exports / enterprise
  exportPDFReport: (frameworkId?: number) => Promise<{ success?: boolean; cancelled?: boolean; error?: string }>;
  createBackup: () => Promise<{ success?: boolean; backup_path?: string; error?: string }>;
  getEnterpriseConfig: () => Promise<EnterpriseConfig>;
  setEnterpriseConfig: (payload: unknown) => Promise<{ success?: boolean; error?: string }>;
  getRemediationPlan: (frameworkId?: number) => Promise<RemediationPlanResult>;
  setRemediation: (payload: unknown) => Promise<{ success?: boolean; error?: string }>;
  getAuditLog: (params?: unknown) => Promise<AuditLogResult>;
  exportData: () => Promise<{ canceled?: boolean; error?: string; file_path?: string; success?: boolean }>;

  // Framework reference + evaluation
  getFrameworkControls: (frameworkId: number) => Promise<FrameworkData | FrameworkDataError>;
  evaluateCompliance: (frameworkId?: number) => Promise<ComplianceEvaluationResult>;
  getEvaluationHistory: (frameworkId: number) => Promise<Array<{ id: number; framework_id: number; evaluation_date: string; overall_score: number; status: string; findings: Record<string, unknown> }> | { error: string }>;
  downloadRemediationScript: (controlId: string) => Promise<{ success?: boolean; file_name?: string; canceled?: boolean; error?: string }>;

  // Any IPC exposed by electron/preload.js that the renderer doesn't consume
  // yet. Declared as `unknown` so consumers have to type them deliberately.
  [key: string]: unknown;
}

declare global {
  interface Window {
    electronAPI?: ElectronAPI;
  }
}

export {};
