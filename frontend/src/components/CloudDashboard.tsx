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
  Typography,
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

function getStatusColor(
  complianceLevel: string | null
): 'success' | 'warning' | 'error' | 'default' {
  if (complianceLevel === 'compliant') return 'success';
  if (complianceLevel === 'at_risk') return 'warning';
  if (complianceLevel === 'critical') return 'error';
  return 'default';
}

interface StatCardProps {
  label: string;
  value: string | number;
}

const StatCard: React.FC<StatCardProps> = ({ label, value }) => (
  <Paper sx={{ p: 3, flex: 1, minWidth: 140, textAlign: 'center' }}>
    <Typography variant="h4" sx={{ fontWeight: 'bold', color: 'primary.main' }}>
      {value}
    </Typography>
    <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
      {label}
    </Typography>
  </Paper>
);

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
    if (tier === 'pro') {
      fetchData();
    }
  }, [fetchData, tier]);

  // Pro gate — rendered after hooks
  if (tier !== 'pro') {
    return (
      <Container maxWidth="xl" sx={{ mt: 4 }}>
        <Paper sx={{ p: 6, textAlign: 'center' }}>
          <Typography variant="h5">
            Cloud Dashboard — Pro Feature
          </Typography>
          <Typography variant="body1" color="text.secondary" sx={{ mt: 2 }}>
            Upgrade to Pro or Enterprise to access the Cloud Dashboard and fleet management.
          </Typography>
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
      {/* Header */}
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3 }}>
        <Typography variant="h4" component="h1" sx={{ fontWeight: 'bold' }}>
          Cloud Dashboard
        </Typography>
        <Button
          variant="outlined"
          startIcon={<Refresh />}
          onClick={fetchData}
          disabled={loading}
          aria-label="Refresh"
        >
          Refresh
        </Button>
      </Box>

      {/* Fleet Stats Cards */}
      {fleetStats && (
        <Box sx={{ display: 'flex', gap: 2, flexWrap: 'wrap', mb: 4 }}>
          <StatCard label="Total Machines" value={fleetStats.total_machines} />
          {/* Compliant card with avg score — label uses "Fleet Compliant" to avoid
              collision with the "Compliant" status chip rendered in the machine table */}
          <Paper sx={{ p: 3, flex: 1, minWidth: 140, textAlign: 'center' }}>
            <Typography variant="h4" sx={{ fontWeight: 'bold', color: 'primary.main' }}>
              {fleetStats.compliant}
            </Typography>
            {fleetStats.avg_score !== null && (
              <Typography variant="body1" sx={{ color: 'success.main', fontWeight: 600 }}>
                {fleetStats.avg_score.toFixed(1)}%
              </Typography>
            )}
            <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
              Fleet Compliant
            </Typography>
          </Paper>
          <StatCard label="At Risk Machines" value={fleetStats.at_risk} />
          <StatCard label="Critical Machines" value={fleetStats.critical} />
        </Box>
      )}

      {/* Machines Table */}
      <TableContainer component={Paper}>
        <Table aria-label="machines table">
          <TableHead>
            <TableRow>
              <TableCell>Machine</TableCell>
              <TableCell>OS</TableCell>
              <TableCell>Score</TableCell>
              <TableCell>Last Sync</TableCell>
              <TableCell>Status</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {machines.map((machine) => {
              const stale = isStale(machine.last_sync_at);
              const statusLabel = getStatusLabel(machine.compliance_level);
              const statusColor = getStatusColor(machine.compliance_level);

              return (
                <TableRow key={machine.id}>
                  <TableCell>{machine.hostname}</TableCell>
                  <TableCell>{machine.os_version ?? '\u2014'}</TableCell>
                  <TableCell>{formatScore(machine.last_score)}</TableCell>
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
                        color={statusColor}
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
