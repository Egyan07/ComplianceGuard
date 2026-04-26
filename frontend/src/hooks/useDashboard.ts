import { useState, useCallback, useEffect } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  getEvidenceSummary,
  getEvidenceItems,
  getMockEvidenceSummary,
  collectEvidence,
  evaluateCompliance,
  EvidenceSummary,
  EvidenceItem,
  ComplianceEvaluation,
} from '../services/api';

const isElectron = !!(window as any).electronAPI;

export const DASHBOARD_QUERY_KEYS = {
  summary: ['dashboard', 'summary'] as const,
  items: ['dashboard', 'items'] as const,
};

export interface DashboardState {
  evaluation: ComplianceEvaluation | null;
  error: string | null;
  successMessage: string | null;
}

export function useDashboard() {
  const queryClient = useQueryClient();

  // ── server state via react-query ──────────────────────────────────────────
  const {
    data: summary = null,
    isLoading: summaryLoading,
    refetch: refetchSummary,
  } = useQuery<EvidenceSummary | null>({
    queryKey: DASHBOARD_QUERY_KEYS.summary,
    queryFn: async () => {
      try {
        return await getEvidenceSummary();
      } catch {
        return getMockEvidenceSummary();
      }
    },
    staleTime: 30_000,
    refetchOnWindowFocus: true,
  });

  const {
    data: evidenceItems = [],
    isLoading: itemsLoading,
    refetch: refetchItems,
  } = useQuery<EvidenceItem[]>({
    queryKey: DASHBOARD_QUERY_KEYS.items,
    queryFn: async () => {
      try {
        return await getEvidenceItems();
      } catch {
        return [];
      }
    },
    staleTime: 30_000,
    refetchOnWindowFocus: true,
  });

  // ── local UI state ─────────────────────────────────────────────────────────
  const [state, setState] = useState<DashboardState>({
    evaluation: null,
    error: null,
    successMessage: null,
  });
  const [collectingEvidence, setCollectingEvidence] = useState(false);
  const [evaluating, setEvaluating] = useState(false);
  const [exportingPDF, setExportingPDF] = useState(false);
  const [syncingCloud, setSyncingCloud] = useState(false);
  const [cloudConnected, setCloudConnected] = useState(false);

  // ── derived ────────────────────────────────────────────────────────────────
  const loading = summaryLoading || itemsLoading;

  // ── actions ────────────────────────────────────────────────────────────────
  const fetchDashboardData = useCallback(async () => {
    await Promise.all([refetchSummary(), refetchItems()]);
  }, [refetchSummary, refetchItems]);

  const handleCollectEvidence = useCallback(async () => {
    setCollectingEvidence(true);
    setState(prev => ({ ...prev, error: null }));
    try {
      const result = await collectEvidence();
      if (result.error) {
        setState(prev => ({ ...prev, error: `Evidence collection failed: ${result.error}` }));
      } else {
        setState(prev => ({
          ...prev,
          successMessage: `Evidence collection complete! ${result.evidence_count || 0} items collected.`,
        }));
      }
    } catch (err: any) {
      setState(prev => ({ ...prev, error: err.message || 'Failed to collect evidence.' }));
    } finally {
      // Invalidate on both success and failure — server state may have partially
      // changed even when the mutation throws, so always sync the cache.
      queryClient.invalidateQueries({ queryKey: ['dashboard'] });
      setCollectingEvidence(false);
    }
  }, [queryClient]);

  const handleEvaluateCompliance = useCallback(async () => {
    if (!isElectron) return;
    setEvaluating(true);
    setState(prev => ({ ...prev, error: null }));
    try {
      const evaluation = await evaluateCompliance();
      setState(prev => ({
        ...prev,
        evaluation,
        successMessage: `Compliance evaluation complete! Score: ${evaluation.overall_score.toFixed(1)}%`,
      }));
    } catch (err: any) {
      setState(prev => ({ ...prev, error: err.message || 'Failed to evaluate compliance.' }));
    } finally {
      // Invalidate on both success and failure — keeps cache consistent with
      // server state regardless of mutation outcome.
      queryClient.invalidateQueries({ queryKey: ['dashboard'] });
      setEvaluating(false);
    }
  }, [queryClient]);

  const handleExportPDF = useCallback(async () => {
    if (!isElectron) return;
    setExportingPDF(true);
    setState(prev => ({ ...prev, error: null }));
    try {
      const api = (window as any).electronAPI;
      const result = await api.exportPDFReport(1);
      if (result.error) {
        setState(prev => ({ ...prev, error: result.error }));
      } else if (!result.cancelled) {
        setState(prev => ({ ...prev, successMessage: 'PDF report exported successfully!' }));
      }
    } catch (err: any) {
      setState(prev => ({ ...prev, error: err.message || 'Failed to export PDF.' }));
    } finally {
      setExportingPDF(false);
    }
  }, []);

  const handleSyncToCloud = useCallback(async () => {
    if (!isElectron) return;
    setSyncingCloud(true);
    setState(prev => ({ ...prev, error: null }));
    try {
      const api = (window as any).electronAPI;
      const levelMap: Record<string, string> = {
        compliant: 'compliant',
        partial_compliance: 'at_risk',
        at_risk: 'at_risk',
        non_compliant: 'critical',
      };
      const evaluation = state.evaluation;
      const result = await api.cloudSync({
        overall_score: evaluation?.overall_score ?? null,
        compliance_level: evaluation?.status
          ? (levelMap[evaluation.status] ?? evaluation.status)
          : null,
        evidence_count: summary?.total_collections ?? null,
      });
      if (result.error) {
        setState(prev => ({ ...prev, error: result.error }));
      } else {
        setState(prev => ({ ...prev, successMessage: 'Synced to cloud successfully!' }));
      }
    } catch (err: any) {
      setState(prev => ({ ...prev, error: err.message || 'Cloud sync failed.' }));
    } finally {
      setSyncingCloud(false);
    }
  }, [state.evaluation, summary]);

  const clearMessage = useCallback(() => {
    setState(prev => ({ ...prev, error: null, successMessage: null }));
  }, []);

  useEffect(() => {
    if (isElectron) {
      const api = (window as any).electronAPI;
      api.cloudGetConfig().then((cfg: any) => setCloudConnected(!!cfg?.connected));
    }
  }, []);

  return {
    // server state
    summary,
    evidenceItems,
    // local state (merged for Dashboard compatibility)
    state: {
      summary,
      evidenceItems,
      evaluation: state.evaluation,
      loading,
      error: state.error,
      successMessage: state.successMessage,
    },
    loading,
    collectingEvidence,
    evaluating,
    exportingPDF,
    syncingCloud,
    cloudConnected,
    fetchDashboardData,
    handleCollectEvidence,
    handleEvaluateCompliance,
    handleExportPDF,
    handleSyncToCloud,
    clearMessage,
  };
}
