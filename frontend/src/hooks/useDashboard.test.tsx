import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';

// Mutable switch so the same mock module can serve both web and electron mode.
// vi.hoisted: the vi.mock factories below are hoisted above this declaration.
const electronState = vi.hoisted(() => ({
  isElectron: false,
  api: {} as Record<string, unknown>,
}));

vi.mock('../services/electron', () => ({
  isElectronMode: () => electronState.isElectron,
  getElectronAPI: () => electronState.api,
}));

vi.mock('../services/api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../services/api')>();
  return {
    ...actual,
    getEvidenceSummary: vi.fn(),
    getEvidenceItems: vi.fn(),
    getMockEvidenceSummary: vi.fn(),
    collectEvidence: vi.fn(),
    evaluateCompliance: vi.fn(),
    evaluateComplianceWeb: vi.fn(),
  };
});

import * as api from '../services/api';
import * as electron from '../services/electron';

const { useDashboard } = await import('./useDashboard');

function makeWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
}

const mockSummary = {
  total_collections: 4,
  total_evidence_items: 12,
  categories: [],
  recent: [],
  compliance_score: 62.5,
};
const mockItems = [{ id: 1, type: 'event_logs' }];

const mockEvaluation = {
  framework_id: 'soc2_v2017',
  overall_score: 62.5,
  status: 'partial',
  compliance_level: 'partial',
  compliant_controls: 5,
  partial_controls: 10,
  non_compliant_controls: 0,
  not_assessed_controls: 39,
  control_count: 54,
  recommendations: [],
  evaluation_date: '2026-08-16T00:00:00Z',
  scope: [],
  evidence_summary: {},
};

describe('useDashboard (web mode)', () => {
  beforeEach(() => {
    electronState.isElectron = false;
    electronState.api = {};
    vi.clearAllMocks();
    vi.mocked(api.getEvidenceSummary).mockResolvedValue(mockSummary);
    vi.mocked(api.getEvidenceItems).mockResolvedValue(mockItems);
    vi.mocked(api.getMockEvidenceSummary).mockResolvedValue(mockSummary);
  });

  it('loads the summary and evidence items through react-query', async () => {
    const { result } = renderHook(() => useDashboard(), { wrapper: makeWrapper() });

    await waitFor(() => expect(result.current.summary).toEqual(mockSummary));
    expect(result.current.evidenceItems).toEqual(mockItems);
    expect(api.getEvidenceSummary).toHaveBeenCalled();
    expect(api.getEvidenceItems).toHaveBeenCalled();
  });

  it('surfaces a load error instead of mock data when the summary fetch fails (CG-M4)', async () => {
    vi.mocked(api.getEvidenceSummary).mockRejectedValue(new Error('down'));
    const { result } = renderHook(() => useDashboard(), { wrapper: makeWrapper() });

    await waitFor(() => expect(result.current.dashboardLoadError).not.toBeNull());
    expect(result.current.summary).toBeNull();
    // The outage must NOT be masked as a healthy empty/mock dashboard.
    expect(api.getMockEvidenceSummary).not.toHaveBeenCalled();
  });

  it('surfaces a load error when fetching items fails (CG-M4)', async () => {
    vi.mocked(api.getEvidenceItems).mockRejectedValue(new Error('down'));
    const { result } = renderHook(() => useDashboard(), { wrapper: makeWrapper() });

    await waitFor(() => expect(result.current.dashboardLoadError).not.toBeNull());
    expect(api.getMockEvidenceSummary).not.toHaveBeenCalled();
  });

  it('handleCollectEvidence reports the collected count on success', async () => {
    vi.mocked(api.collectEvidence).mockResolvedValue({ evidence_count: 7, error: null });
    const { result } = renderHook(() => useDashboard(), { wrapper: makeWrapper() });

    await act(async () => {
      await result.current.handleCollectEvidence();
    });
    expect(result.current.state.successMessage).toContain('7 items collected');
    expect(result.current.state.error).toBeNull();
  });

  it('handleCollectEvidence surfaces a result-level error', async () => {
    vi.mocked(api.collectEvidence).mockResolvedValue({ evidence_count: 0, error: 'no perms' });
    const { result } = renderHook(() => useDashboard(), { wrapper: makeWrapper() });

    await act(async () => {
      await result.current.handleCollectEvidence();
    });
    expect(result.current.state.error).toContain('no perms');
  });

  it('handleCollectEvidence surfaces thrown errors via getErrorMessage', async () => {
    vi.mocked(api.collectEvidence).mockRejectedValue(new Error('boom'));
    const { result } = renderHook(() => useDashboard(), { wrapper: makeWrapper() });

    await act(async () => {
      await result.current.handleCollectEvidence();
    });
    expect(result.current.state.error).toBe('boom');
  });

  it('handleEvaluateCompliance (web) stores the evaluation and notes not-assessed controls', async () => {
    vi.mocked(api.evaluateComplianceWeb).mockResolvedValue(mockEvaluation);
    const { result } = renderHook(() => useDashboard(), { wrapper: makeWrapper() });

    await act(async () => {
      await result.current.handleEvaluateCompliance();
    });
    expect(api.evaluateComplianceWeb).toHaveBeenCalledWith(1);
    expect(api.evaluateCompliance).not.toHaveBeenCalled();
    expect(result.current.state.evaluation).toEqual(mockEvaluation);
    expect(result.current.state.successMessage).toContain('62.5%');
    expect(result.current.state.successMessage).toContain('39 controls not yet assessed');
  });

  it('handleEvaluateCompliance (web) surfaces failures without crashing', async () => {
    vi.mocked(api.evaluateComplianceWeb).mockRejectedValue(new Error('eval down'));
    const { result } = renderHook(() => useDashboard(), { wrapper: makeWrapper() });

    await act(async () => {
      await result.current.handleEvaluateCompliance();
    });
    expect(result.current.state.error).toBe('eval down');
    expect(result.current.state.evaluation).toBeNull();
  });

  it('handleRescan in web mode delegates to handleEvaluateCompliance', async () => {
    vi.mocked(api.evaluateComplianceWeb).mockResolvedValue(mockEvaluation);
    const { result } = renderHook(() => useDashboard(), { wrapper: makeWrapper() });

    await act(async () => {
      await result.current.handleRescan();
    });
    expect(api.evaluateComplianceWeb).toHaveBeenCalled();
  });

  it('clearMessage resets error and success states', async () => {
    vi.mocked(api.evaluateComplianceWeb).mockResolvedValue(mockEvaluation);
    const { result } = renderHook(() => useDashboard(), { wrapper: makeWrapper() });

    await act(async () => {
      await result.current.handleEvaluateCompliance();
    });
    expect(result.current.state.successMessage).not.toBeNull();

    act(() => result.current.clearMessage());
    expect(result.current.state.successMessage).toBeNull();
    expect(result.current.state.error).toBeNull();
  });
});

describe('useDashboard (electron mode)', () => {
  // The hook captures isElectron at module load, so electron-mode tests reload
  // the module with the flag flipped. vi.mock factories re-run on resetModules,
  // so the fresh module's mocks must be re-stubbed after each load.
  async function loadElectron() {
    electronState.isElectron = true;
    vi.resetModules();
    const apiMod = (await import('../services/api')) as typeof api;
    const electronMod = (await import('../services/electron')) as typeof electron;
    const { useDashboard: useDashboardElectron } = await import('./useDashboard');
    // The vi.mock module instances are shared across resetModules, so clear
    // call history left by the web-mode describe before asserting on them.
    vi.clearAllMocks();
    return { useDashboard: useDashboardElectron, apiMod, electronMod };
  }

  async function stubApi(apiMod: typeof api) {
    vi.mocked(apiMod.getEvidenceSummary).mockResolvedValue(mockSummary);
    vi.mocked(apiMod.getEvidenceItems).mockResolvedValue(mockItems);
    vi.mocked(apiMod.evaluateCompliance).mockResolvedValue(mockEvaluation);
  }

  it('handleEvaluateCompliance (electron) uses the IPC path', async () => {
    electronState.api = {
      cloudGetConfig: vi.fn().mockResolvedValue({ connected: false }),
    };
    const { useDashboard, apiMod } = await loadElectron();
    await stubApi(apiMod);
    const { result } = renderHook(() => useDashboard(), { wrapper: makeWrapper() });

    await act(async () => {
      await result.current.handleEvaluateCompliance();
    });
    expect(apiMod.evaluateCompliance).toHaveBeenCalled();
    expect(apiMod.evaluateComplianceWeb).not.toHaveBeenCalled();
    expect(result.current.state.successMessage).toContain('62.5%');
  });

  it('handleRescan in electron mode runs collection then evaluates', async () => {
    electronState.api = {
      runCollectionNow: vi.fn().mockResolvedValue(undefined),
      cloudGetConfig: vi.fn().mockResolvedValue({ connected: false }),
    };
    const { useDashboard, apiMod } = await loadElectron();
    await stubApi(apiMod);
    const { result } = renderHook(() => useDashboard(), { wrapper: makeWrapper() });

    await act(async () => {
      await result.current.handleRescan();
    });
    expect(electronState.api.runCollectionNow).toHaveBeenCalled();
    expect(apiMod.evaluateCompliance).toHaveBeenCalled();
    expect(result.current.state.evaluation).toEqual(mockEvaluation);
  });

  it('handleExportPDF reports success', async () => {
    electronState.api = {
      exportPDFReport: vi.fn().mockResolvedValue({ error: null, cancelled: false }),
      cloudGetConfig: vi.fn().mockResolvedValue({ connected: false }),
    };
    const { useDashboard } = await loadElectron();
    const { result } = renderHook(() => useDashboard(), { wrapper: makeWrapper() });

    await act(async () => {
      await result.current.handleExportPDF();
    });
    expect(electronState.api.exportPDFReport).toHaveBeenCalledWith(1);
    expect(result.current.state.successMessage).toContain('PDF report exported');
  });

  it('handleExportPDF reports cancellation without a message', async () => {
    electronState.api = {
      exportPDFReport: vi.fn().mockResolvedValue({ error: null, cancelled: true }),
      cloudGetConfig: vi.fn().mockResolvedValue({ connected: false }),
    };
    const { useDashboard } = await loadElectron();
    const { result } = renderHook(() => useDashboard(), { wrapper: makeWrapper() });

    await act(async () => {
      await result.current.handleExportPDF();
    });
    expect(result.current.state.successMessage).toBeNull();
  });

  it('handleSyncToCloud maps the compliance level and reports success', async () => {
    electronState.api = {
      cloudSync: vi.fn().mockResolvedValue({ error: null }),
      cloudGetConfig: vi.fn().mockResolvedValue({ connected: false }),
    };
    const { useDashboard, apiMod } = await loadElectron();
    await stubApi(apiMod);
    const { result } = renderHook(() => useDashboard(), { wrapper: makeWrapper() });

    // Prime state.evaluation by evaluating first.
    await act(async () => {
      await result.current.handleEvaluateCompliance();
    });
    // Wait for the summary query to resolve — cloud sync reports its count.
    await waitFor(() => expect(result.current.summary).toEqual(mockSummary));
    await act(async () => {
      await result.current.handleSyncToCloud();
    });
    expect(electronState.api.cloudSync).toHaveBeenCalledWith({
      overall_score: 62.5,
      compliance_level: 'partial',
      evidence_count: 4,
    });
    expect(result.current.state.successMessage).toContain('Synced to cloud');
  });

  it('reads the cloud connection state on mount', async () => {
    electronState.api = {
      cloudGetConfig: vi.fn().mockResolvedValue({ connected: true }),
    };
    const { useDashboard } = await loadElectron();
    const { result } = renderHook(() => useDashboard(), { wrapper: makeWrapper() });

    await waitFor(() => expect(result.current.cloudConnected).toBe(true));
    expect(electronState.api.cloudGetConfig).toHaveBeenCalled();
  });
});
