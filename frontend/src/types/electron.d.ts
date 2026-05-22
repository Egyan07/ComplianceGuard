/**
 * Narrow type surface for the Electron preload bridge exposed on
 * `window.electronAPI`. The preload script lives at electron/preload.js and
 * exposes a broader set of IPCs; this file types only the subset consumed
 * by the React code so that `any` casts stay out of the renderer.
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

export interface ElectronAPI extends ElectronLicenseAPI {
  getFrameworkControls: (frameworkId: number) => Promise<FrameworkData | FrameworkDataError>;
  evaluateCompliance: (frameworkId?: number) => Promise<ComplianceEvaluationResult>;
  getSchedule: () => Promise<ScheduleState>;
  setSchedule: (config: ScheduleConfig) => Promise<{ config: ScheduleConfig; next_run_at: string | null } | { error: string }>;
  runCollectionNow: () => Promise<CollectionResult | { error: string }>;
  downloadRemediationScript: (controlId: string) => Promise<{ success?: boolean; file_name?: string; canceled?: boolean; error?: string }>;
  // Other IPCs exposed by electron/preload.js. Declared as `unknown` so
  // consumers that need them have to cast with a narrow helper rather than
  // sprinkling `any` everywhere.
  [key: string]: unknown;
}

declare global {
  interface Window {
    electronAPI?: ElectronAPI;
  }
}

export {};
