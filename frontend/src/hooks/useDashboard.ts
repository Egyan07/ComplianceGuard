import { useState, useCallback, useEffect } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  getEvidenceSummary,
  getEvidenceItems,
  getMockEvidenceSummary,
  collectEvidence,
  evaluateCompliance,
  evaluateComplianceWeb,
  EvidenceSummary,
  EvidenceItem,
  ComplianceEvaluation,
} from '../services/api';
import { getElectronAPI, isElectronMode } from '../services/electron';
import { getErrorMessage } from '../lib/errors';

const isElectron = isElectronMode();

export const DASHBOARD_QUERY_KEYS = {
  summary: ['dashboard', 'summary'] as const,
  items: ['dashboard', 'items'] as const,
};

export interface DashboardState {
  evaluation: ComplianceEvaluation | null;
  error: string | null;
  successMessage: string | null;
}export function useDashboard() {
  const queryClient = useQueryClient();

  // ── local UI state (selectedFramework needed by queries below) ────────────
  const [state, setState] = useState<DashboardState>({
    evaluation: null,
    error: null,
    successMessage: null,
  });
  const [collectingEvidence, setCollectingEvidence] = useState(false);
  const [evaluating, setEvaluating] = useState(false);
  const [selectedFramework, setSelectedFramework] = useState<1 | 2 | 3 | 4>(1);

  // ── server state via react-query ──────────────────────────────────────────
  const {
    data: summary = null,
    isLoading: summaryLoading,
    refetch: refetchSummary,
  } = useQuery<EvidenceSummary | null>({
    queryKey: [...DASHBOARD_QUERY_KEYS.summary, selectedFramework],
    queryFn: async () => {
      try {
        return await getEvidenceSummary(selectedFramework);
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
    queryKey: [...DASHBOARD_QUERY_KEYS.items, selectedFramework],
    queryFn: async () => {
      try {
        return await getEvidenceItems(undefined, undefined, selectedFramework);
      } catch {
        return [];
      }
    },
    staleTime: 30_000,
    refetchOnWindowFocus: true,
  });

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
      const result = await collectEvidence(undefined, selectedFramework);
      if (result.error) {
        setState(prev => ({ ...prev, error: `Evidence collection failed: ${result.error}` }));
      } else {
        setState(prev => ({
          ...prev,
          successMessage: `Evidence collection complete! ${result.evidence_count || 0} items collected.`,
        }));
      }
    } catch (err) {
      setState(prev => ({ ...prev, error: getErrorMessage(err, 'Failed to collect evidence.') }));
    } finally {
      // Invalidate on both success and failure — server state may have partially
      // changed even when the mutation throws, so always sync the cache.
      queryClient.invalidateQueries({ queryKey: ['dashboard'] });
      setCollectingEvidence(false);
    }
  }, [queryClient, selectedFramework]);

  const handleEvaluateCompliance = useCallback(async () => {
    setEvaluating(true);
    setState(prev => ({ ...prev, error: null }));
    try {
      const evaluation = isElectron
        ? await evaluateCompliance(selectedFramework)
        : await evaluateComplianceWeb(selectedFramework);
      // The overall score is the share of required control evidence demonstrated
      // (0-100 canonical contract on both desktop and web). Controls with no
      // evidence are not_assessed and pull the score down until collected —
      // surface that distinction instead of reporting a bare percentage.
      const notAssessed = evaluation.not_assessed_controls ?? 0;
      const assessedNote = notAssessed > 0
        ? ` ${notAssessed} control${notAssessed === 1 ? '' : 's'} not yet assessed.`
        : '';
      setState(prev => ({
        ...prev,
        evaluation,
        successMessage: `Evaluation complete — evidence coverage score: ${evaluation.overall_score.toFixed(1)}%.${assessedNote}`,
      }));
    } catch (err) {
      setState(prev => ({ ...prev, error: getErrorMessage(err, 'Failed to evaluate compliance.') }));
    } finally {
      queryClient.invalidateQueries({ queryKey: ['dashboard'] });
      setEvaluating(false);
    }
  }, [queryClient, selectedFramework]);

  const handleRescan = useCallback(async () => {
    setState(prev => ({ ...prev, error: null }));
    if (isElectron) {
      const api = getElectronAPI();
      setEvaluating(true);
      try {
        await api.runCollectionNow();
        const evaluation = await evaluateCompliance(selectedFramework);
        setState(prev => ({ ...prev, evaluation }));
      } catch (err) {
        setState(prev => ({ ...prev, error: getErrorMessage(err, 'Re-scan failed.') }));
        throw err; // ControlHeatmap catches this to set verification_failed
      } finally {
        setEvaluating(false);
        queryClient.invalidateQueries({ queryKey: ['dashboard'] });
      }
    } else {
      await handleEvaluateCompliance();
    }
  }, [selectedFramework, handleEvaluateCompliance, queryClient]);

  const handleExportPDF = useCallback(async () => {
    if (!isElectron) return;
    setExportingPDF(true);
    setState(prev => ({ ...prev, error: null }));
    try {
      const api = getElectronAPI();
      const result = await api.exportPDFReport(1);
      if (result.error) {
        setState(prev => ({ ...prev, error: result.error ?? 'Failed to export PDF.' }));
      } else if (!result.cancelled) {
        setState(prev => ({ ...prev, successMessage: 'PDF report exported successfully!' }));
      }
    } catch (err) {
      setState(prev => ({ ...prev, error: getErrorMessage(err, 'Failed to export PDF.') }));
    } finally {
      setExportingPDF(false);
    }
  }, []);

  const handleSyncToCloud = useCallback(async () => {
    if (!isElectron) return;
    setSyncingCloud(true);
    setState(prev => ({ ...prev, error: null }));
    try {
      const api = getElectronAPI();
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
        setState(prev => ({ ...prev, error: result.error ?? 'Cloud sync failed.' }));
      } else {
        setState(prev => ({ ...prev, successMessage: 'Synced to cloud successfully!' }));
      }
    } catch (err) {
      setState(prev => ({ ...prev, error: getErrorMessage(err, 'Cloud sync failed.') }));
    } finally {
      setSyncingCloud(false);
    }
  }, [state.evaluation, summary]);

  const clearMessage = useCallback(() => {
    setState(prev => ({ ...prev, error: null, successMessage: null }));
  }, []);

  useEffect(() => {
    if (isElectron) {
      const api = getElectronAPI();
      api.cloudGetConfig().then((cfg) => setCloudConnected(!!cfg?.connected)).catch(() => setCloudConnected(false));
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
    selectedFramework,
    setSelectedFramework,
    exportingPDF,
    syncingCloud,
    cloudConnected,
    fetchDashboardData,
    handleCollectEvidence,
    handleEvaluateCompliance,
    handleRescan,
    handleExportPDF,
    handleSyncToCloud,
    clearMessage,
  };
}
