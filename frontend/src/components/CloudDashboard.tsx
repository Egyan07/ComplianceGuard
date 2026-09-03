/*
CloudDashboard Component

Displays fleet-wide compliance stats and per-machine compliance status.
Available to pro and enterprise tier users only.
*/

import React, { useState, useEffect, useCallback } from 'react';
import {
  Box,
  Container,
  Paper,
  Button,
  CircularProgress,
  Chip,
  Tooltip,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
} from '@mui/material';
import { Refresh, SyncProblem } from '@mui/icons-material';
import { useLicense } from '../contexts/LicenseContext';
import { getFleetStats, getMachines, FleetStats, MachineRecord } from '../services/api';
import PageHeader from './ui/PageHeader';
import EmptyState from './ui/EmptyState';
import StatCard from './ui/StatCard';
import { RADIUS, Tone } from '../theme';

const STALE_THRESHOLD_DAYS = 7;

function isStale(lastSyncAt: string | null): boolean {
  if (!lastSyncAt) return false;
  const diffMs = Date.now() - new Date(lastSyncAt).getTime();
  return diffMs / (1000 * 60 * 60 * 24) > STALE_THRESHOLD_DAYS;
}

function formatScore(score: number | null): string {
  if (score === null) return '\u2014';
  return `${score.toFixed(1)}%`;
}

function formatLastSync(lastSyncAt: string | null): string {
  if (!lastSyncAt) return 'Never';
  return new Date(lastSyncAt).toLocaleDateString();
}

function getStatusLabel(complianceLevel: string | null): string {
  if (complianceLevel === 'compliant') return 'Compliant';
  if (complianceLevel === 'at_risk') return 'At Risk';
  if (complianceLevel === 'critical') return 'Critical';
  return '\u2014';
}

function getTone(complianceLevel: string | null): Tone {
  if (complianceLevel === 'compliant') return 'success';
  if (complianceLevel === 'at_risk') return 'warning';
  if (complianceLevel === 'critical') return 'error';
  return 'neutral';
}

interface CloudDashboardProps {
  onNavigate?: (page: string) => void;
}

const CloudDashboard: React.FC<CloudDashboardProps> = () => {
  const { tier } = useLicense();
  const [fleetStats, setFleetStats] = useState<FleetStats | null>(null);
  const [machines, setMachines] = useState<MachineRecord[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const [stats, machineList] = await Promise.all([getFleetStats(), getMachines()]);
      setFleetStats(stats);
      setMachines(machineList);
    } catch (err) {
      console.error('CloudDashboard fetch error:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (tier !== 'free') {
      fetchData();
    }
  }, [fetchData, tier]);

  // Paid gate (pro + enterprise) — rendered after hooks
  if (tier === 'free') {
    return (
      <Container maxWidth="xl" sx={{ mt: 4 }}>
        <Paper sx={{ borderRadius: RADIUS.lg }}>
          <EmptyState
            title="Cloud Dashboard — Pro Feature"
            description="Upgrade to Pro or Enterprise to access the Cloud Dashboard and fleet management."
          />
        </Paper>
      </Container>
    );
  }

  if (loading && !fleetStats) {
    return (
      <Container maxWidth="xl" sx={{ mt: 4 }}>
        <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: 400 }}>
          <CircularProgress size={60} />
        </Box>
      </Container>
    );
  }

  return (
    <Container maxWidth="xl" sx={{ mt: 4, mb: 4 }}>
      <PageHeader
        title="Cloud Dashboard"
        subtitle="Fleet-wide compliance status across synced machines"
        actions={
          <Button
            variant="outlined"
            startIcon={<Refresh />}
            onClick={fetchData}
            disabled={loading}
            aria-label="Refresh"
          >
            Refresh
          </Button>
        }
      />

      {/* Fleet Stats Cards */}
      {fleetStats && (
        <Box sx={{ display: 'flex', gap: 2, flexWrap: 'wrap', mb: 4 }}>
          <StatCard label="Total Machines" value={fleetStats.total_machines} tone="info" />
          {/* Compliant card with avg score — label uses "Fleet Compliant" to avoid
              collision with the "Compliant" status chip rendered in the machine table */}
          <StatCard
            label="Fleet Compliant"
            value={fleetStats.compliant}
            tone="success"
            secondary={fleetStats.avg_score !== null ? `${fleetStats.avg_score.toFixed(1)}%` : undefined}
          />
          <StatCard label="At Risk Machines" value={fleetStats.at_risk} tone="warning" />
          <StatCard label="Critical Machines" value={fleetStats.critical} tone="error" />
        </Box>
      )}

      {/* Machines Table */}
      <TableContainer component={Paper} sx={{ overflowX: 'auto' }}>
        <Table aria-label="machines table">
          <TableHead>
            <TableRow>
              <TableCell>Machine</TableCell>
              <TableCell sx={{ display: { xs: 'none', sm: 'table-cell' } }}>OS</TableCell>
              <TableCell>Score</TableCell>
              <TableCell>Last Sync</TableCell>
              <TableCell>Status</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {machines.map((machine) => {
              const stale = isStale(machine.last_sync_at);
              const statusLabel = getStatusLabel(machine.compliance_level);
              const tone = getTone(machine.compliance_level);

              return (
                <TableRow key={machine.id} hover>
                  <TableCell sx={{ fontWeight: 600 }}>{machine.hostname}</TableCell>
                  <TableCell sx={{ display: { xs: 'none', sm: 'table-cell' } }}>
                    {machine.os_version ?? '\u2014'}
                  </TableCell>
                  <TableCell sx={{ fontVariantNumeric: 'tabular-nums' }}>
                    {formatScore(machine.last_score)}
                  </TableCell>
                  <TableCell>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                      {formatLastSync(machine.last_sync_at)}
                      {stale && (
                        <Tooltip title="Stale — last synced more than 7 days ago">
                          <SyncProblem
                            fontSize="small"
                            color="warning"
                            aria-label="Stale"
                          />
                        </Tooltip>
                      )}
                    </Box>
                  </TableCell>
                  <TableCell>
                    {machine.compliance_level ? (
                      <Chip
                        label={statusLabel}
                        size="small"
                        sx={{
                          fontSize: '0.7rem',
                          fontWeight: 600,
                          color: `${tone}.dark`,
                          backgroundColor: `${tone}.light`,
                          border: '1px solid',
                          borderColor: 'divider',
                        }}
                      />
                    ) : (
                      '\u2014'
                    )}
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </TableContainer>
    </Container>
  );
};

export default CloudDashboard;
