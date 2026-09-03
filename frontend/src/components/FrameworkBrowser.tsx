import React, { useState, useEffect, useMemo } from 'react';
import { motion } from 'framer-motion';
import {
  Box,
  Container,
  Typography,
  Tabs,
  Tab,
  TextField,
  Select,
  MenuItem,
  FormControl,
  InputLabel,
  Accordion,
  AccordionSummary,
  AccordionDetails,
  Chip,
  Alert,
  CircularProgress,
  InputAdornment,
  Paper,
} from '@mui/material';
import { useTheme } from '@mui/material/styles';
import { ExpandMore, Search } from '@mui/icons-material';
import PageHeader from './ui/PageHeader';
import { RADIUS, toneColors } from '../theme';
import type { FrameworkControl, FrameworkData, FrameworkDataError } from '../types/electron';

type RiskFilter = 'all' | 'high' | 'medium' | 'low';

const FRAMEWORKS = [
  { id: 1, label: 'SOC 2' },
  { id: 2, label: 'ISO 27001' },
  { id: 3, label: 'HIPAA' },
  { id: 4, label: 'GDPR' },
] as const;



function groupByCategory(controls: FrameworkControl[]): Record<string, FrameworkControl[]> {
  return controls.reduce<Record<string, FrameworkControl[]>>((acc, control) => {
    if (!acc[control.category]) acc[control.category] = [];
    acc[control.category].push(control);
    return acc;
  }, {});
}

const accordionListVariants = {
  hidden: {},
  visible: { transition: { staggerChildren: 0.05 } },
};

const accordionItemVariants = {
  hidden:  { opacity: 0, y: 8 },
  visible: { opacity: 1, y: 0, transition: { type: 'spring' as const, stiffness: 180, damping: 22 } },
};

const FrameworkBrowser: React.FC = () => {
  const [activeTab, setActiveTab] = useState(0);
  const [search, setSearch] = useState('');
  const [riskFilter, setRiskFilter] = useState<RiskFilter>('all');
  const [frameworks, setFrameworks] = useState<Record<number, FrameworkData | FrameworkDataError>>({});
  const [loading, setLoading] = useState<Record<number, boolean>>({});

  const theme = useTheme();
  const chipFor = (tone: 'error' | 'warning' | 'success' | 'info' | 'neutral') => {
    const c = toneColors(theme, tone);
    return { backgroundColor: c.surface, color: c.onSurface, border: `1px solid ${c.border}` };
  };
  const RISK_CHIP_SX: Record<string, object> = {
    high: chipFor('error'),
    medium: chipFor('warning'),
    low: chipFor('success'),
  };
  const SPEC_TYPE_SX: Record<string, object> = {
    required: chipFor('info'),
    addressable: chipFor('neutral'),
  };

  const api = window.electronAPI;
  const currentFrameworkId = FRAMEWORKS[activeTab].id;

  useEffect(() => {
    if (frameworks[currentFrameworkId] !== undefined || loading[currentFrameworkId]) return;
    if (!api?.getFrameworkControls) {
      setFrameworks(prev => ({ ...prev, [currentFrameworkId]: { error: 'Electron API unavailable' } }));
      return;
    }
    setLoading(prev => ({ ...prev, [currentFrameworkId]: true }));
    api.getFrameworkControls(currentFrameworkId)
      .then((data: FrameworkData | FrameworkDataError) => {
        setFrameworks(prev => ({ ...prev, [currentFrameworkId]: data }));
      })
      .catch((err: Error) => {
        setFrameworks(prev => ({ ...prev, [currentFrameworkId]: { error: err.message } }));
      })
      .finally(() => {
        setLoading(prev => ({ ...prev, [currentFrameworkId]: false }));
      });
  // frameworks/loading/api are read only as gate conditions; excluding them prevents re-fetch loops
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentFrameworkId]);

  const currentData = frameworks[currentFrameworkId];
  const isLoading = loading[currentFrameworkId];

  const filteredControls = useMemo<FrameworkControl[]>(() => {
    if (!currentData || 'error' in currentData) return [];
    const q = search.toLowerCase();
    return currentData.controls.filter(c => {
      const matchesSearch = !q ||
        c.title.toLowerCase().includes(q) ||
        c.description.toLowerCase().includes(q);
      const matchesRisk = riskFilter === 'all' || c.risk_level === riskFilter;
      return matchesSearch && matchesRisk;
    });
  }, [currentData, search, riskFilter]);

  const grouped = useMemo(() => groupByCategory(filteredControls), [filteredControls]);

  const handleTabChange = (_: React.SyntheticEvent, value: number) => {
    setActiveTab(value);
    setSearch('');
    setRiskFilter('all');
  };

  return (
    <Container maxWidth="xl" sx={{ py: 3 }}>
      <PageHeader title="Browse Frameworks" subtitle="Read-only reference library" />

      <Paper elevation={0} sx={{ border: '1px solid', borderColor: 'divider' }}>
        <Tabs
          value={activeTab}
          onChange={handleTabChange}
          slotProps={{ indicator: { style: { height: 2, borderRadius: RADIUS.pill } } }}
          sx={{ borderBottom: '1px solid', borderColor: 'divider', px: 2 }}
        >
          {FRAMEWORKS.map(f => <Tab key={f.id} label={f.label} />)}
        </Tabs>

        <Box sx={{ p: 2, display: 'flex', gap: 2, borderBottom: '1px solid', borderColor: 'divider' }}>
          <TextField
            size="small"
            placeholder="Search controls..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            sx={{ flex: 1 }}
            slotProps={{
              input: {
                startAdornment: (
                  <InputAdornment position="start">
                    <Search fontSize="small" />
                  </InputAdornment>
                ),
              },
            }}
          />
          <FormControl size="small" sx={{ minWidth: 120 }}>
            <InputLabel id="risk-filter-label">Risk</InputLabel>
            <Select
              labelId="risk-filter-label"
              value={riskFilter}
              label="Risk"
              onChange={e => setRiskFilter(e.target.value as RiskFilter)}
            >
              <MenuItem value="all">All</MenuItem>
              <MenuItem value="high">High</MenuItem>
              <MenuItem value="medium">Medium</MenuItem>
              <MenuItem value="low">Low</MenuItem>
            </Select>
          </FormControl>
        </Box>

        <Box sx={{ p: 2 }}>
          {isLoading && (
            <Box sx={{ display: 'flex', justifyContent: 'center', py: 4 }}>
              <CircularProgress />
            </Box>
          )}

          {!isLoading && currentData && 'error' in currentData && (
            <Alert severity="error">{currentData.error}</Alert>
          )}

          {!isLoading && currentData && !('error' in currentData) && (
            Object.keys(grouped).length === 0 ? (
              <Typography color="text.secondary" sx={{ py: 2 }}>
                No controls match your filters.
              </Typography>
            ) : (
              <motion.div variants={accordionListVariants} initial="hidden" animate="visible">
                {Object.entries(grouped).map(([category, controls]) => (
                  <motion.div key={category} variants={accordionItemVariants}>
                    <Accordion
                      disableGutters
                      elevation={0}
                      sx={{ border: '1px solid', borderColor: 'divider', mb: 1, '&:before': { display: 'none' } }}
                    >
                      <AccordionSummary expandIcon={<ExpandMore />} sx={{ borderRadius: '6px' }}>
                        <Typography sx={{ fontWeight: 500 }}>{category} ({controls.length})</Typography>
                      </AccordionSummary>
                      <AccordionDetails sx={{ p: 0 }}>
                        {controls.map(control => (
                          <Accordion
                            key={control.id}
                            disableGutters
                            elevation={0}
                            sx={{ borderTop: '1px solid', borderColor: 'divider', '&:before': { display: 'none' } }}
                          >
                        <AccordionSummary expandIcon={<ExpandMore />}>
                          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, width: '100%', pr: 1 }}>
                            <Typography variant="body2" color="text.secondary" sx={{ minWidth: 80 }}>
                              {control.id}
                            </Typography>
                            <Typography variant="body2" sx={{ flex: 1 }}>
                              {control.title}
                            </Typography>
                            {control.risk_level && (
                              <Chip
                                label={control.risk_level.toUpperCase()}
                                size="small"
                                sx={{ ...(RISK_CHIP_SX[control.risk_level] ?? {}), fontWeight: 600, fontSize: '0.65rem' }}
                              />
                            )}
                          </Box>
                        </AccordionSummary>
                        <AccordionDetails sx={{ backgroundColor: '#F8FAFC', p: 2 }}>
                          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
                            <Box>
                              <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 650, display: 'block', letterSpacing: '0.4px', textTransform: 'uppercase' }}>
                                Description
                              </Typography>
                              <Typography variant="body2">{control.description}</Typography>
                            </Box>
                            <Box>
                              <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 650, display: 'block', letterSpacing: '0.4px', textTransform: 'uppercase' }}>
                                Objective
                              </Typography>
                              <Typography variant="body2">{control.control_objective}</Typography>
                            </Box>
                            <Box>
                              <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 650, display: 'block', letterSpacing: '0.4px', textTransform: 'uppercase' }}>
                                Implementation guidance
                              </Typography>
                              <Typography variant="body2">{control.implementation_guidance}</Typography>
                            </Box>
                            {control.specification_type && (
                              <Box>
                                <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 650, display: 'block', letterSpacing: '0.4px', textTransform: 'uppercase' }}>
                                  Type
                                </Typography>
                                <Chip
                                  label={control.specification_type}
                                  size="small"
                                  sx={{ mt: 0.5, ...(SPEC_TYPE_SX[control.specification_type] ?? {}), fontWeight: 500 }}
                                />
                              </Box>
                            )}
                          </Box>
                        </AccordionDetails>
                      </Accordion>
                        ))}
                      </AccordionDetails>
                    </Accordion>
                  </motion.div>
                ))}
              </motion.div>
            )
          )}
        </Box>
      </Paper>
    </Container>
  );
};

export default FrameworkBrowser;
