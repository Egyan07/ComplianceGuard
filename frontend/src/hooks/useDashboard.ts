import { useState, useEffect, useCallback } from 'react';
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

export interface DashboardState {
  summary: EvidenceSummary | null;
  evidenceItems: EvidenceItem[];
  evaluation: ComplianceEvaluation | null;
  loading: boolean;
  error: string | null;
  successMessage: string | null;
}

export function useDashboard() {
  const [state, setState] = useState<DashboardState>({
    summary: null,
    evidenceItems: [],
    evaluation: null,
    loading: true,
    error: null,
    successMessage: null,
  });

  const [collectingEvidence, setCollectingEvidence] = useState(false);
  const [evaluating, setEvaluating] = useState(false);
  const [exportingPDF, setExportingPDF] = useState(false);
  const [syncingCloud, setSyncingCloud] = useState(false);
  const [cloudConnected, setCloudConnected] = useState(false);

  const fetchDashboardData = useCallback(async () => {
    setState(prev => ({ ...prev, loading: true, error: null }));
    try {
      let summary: EvidenceSummary;
      let evidenceItems: EvidenceItem[];
      try {
        summary = await getEvidenceSummary();
      } catch {
        summary = getMockEvidenceSummary();
      }
      try {
        evidenceItems = await getEvidenceItems();
      } catch {
        evidenceItems = [];
      }
      setState(prev => {
        if (prev.evaluation) {
          summary.compliance_metrics.overall_compliance_score =
            Math.round(prev.evaluation!.overall_score);
        }
        return { ...prev, summary, evidenceItems, loading: false };
      });
    } catch {
      setState(prev => ({
        ...prev,
        loading: false,
        error: 'Failed to load dashboard data. Please try again.',
      }));
    }
  }, []);

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
        setTimeout(fetchDashboardData, 1000);
      }
    } catch (err: any) {
      setState(prev => ({ ...prev, error: err.message || 'Failed to collect evidence.' }));
    } finally {
      setCollectingEvidence(false);
    }
  }, [fetchDashboardData]);

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
      setTimeout(fetchDashboardData, 500);
    } catch (err: any) {
      setState(prev => ({ ...prev, error: err.message || 'Failed to evaluate compliance.' }));
    } finally {
      setEvaluating(false);
    }
  }, [fetchDashboardData]);

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
      const result = await api.cloudSync({
        overall_score: state.evaluation?.overall_score ?? null,
        compliance_level: state.evaluation?.status
          ? (levelMap[state.evaluation.status] ?? state.evaluation.status)
          : null,
        evidence_count: state.summary?.total_collections ?? null,
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
  }, [state.evaluation, state.summary]);

  const clearMessage = useCallback(() => {
    setState(prev => ({ ...prev, error: null, successMessage: null }));
  }, []);

  useEffect(() => {
    fetchDashboardData();
    if (isElectron) {
      const api = (window as any).electronAPI;
      api.cloudGetConfig().then((cfg: any) => setCloudConnected(!!cfg?.connected));
    }
  }, [fetchDashboardData]);

  return {
    state,
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
