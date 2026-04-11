/*
Evidence List Component

Displays a list of compliance evidence items with status indicators,
source information, and filtering capabilities using Material-UI.
*/

import React, { useState } from 'react';
import {
  Card,
  CardContent,
  CardHeader,
  Typography,
  List,
  Chip,
  Box,
  Collapse,
  TextField,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  SelectChangeEvent
} from '@mui/material';
import {
  Cloud,
  Security,
  Storage,
  ExpandLess,
  ExpandMore,
  FilterList
} from '@mui/icons-material';
import { EvidenceItem } from '../services/api';

interface EvidenceListProps {
  evidenceItems: EvidenceItem[];
  loading?: boolean;
  onItemClick?: (item: EvidenceItem) => void;
}

interface FilterState {
  status: string;
  source: string;
  searchTerm: string;
}

const EvidenceList: React.FC<EvidenceListProps> = ({
  evidenceItems,
  loading = false,
  onItemClick
}) => {
  const [expandedItems, setExpandedItems] = useState<Set<string>>(new Set());
  const [filters, setFilters] = useState<FilterState>({
    status: 'all',
    source: 'all',
    searchTerm: ''
  });

  const toggleExpanded = (itemId: string) => {
    const newExpanded = new Set(expandedItems);
    if (expandedItems.has(itemId)) {
      newExpanded.delete(itemId);
    } else {
      newExpanded.add(itemId);
    }
    setExpandedItems(newExpanded);
  };

  const handleFilterChange = (
    event: SelectChangeEvent<string> | React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>
  ) => {
    const { name, value } = event.target;
    setFilters(prev => ({
      ...prev,
      [name as string]: value
    }));
  };

  const getStatusColor = (status: string) => {
    switch (status.toLowerCase()) {
      case 'compliant':
        return 'success';
      case 'warning':
        return 'warning';
      case 'non_compliant':
      case 'non-compliant':
        return 'error';
      default:
        return 'default';
    }
  };

  const getSourceIcon = (source: string) => {
    switch (source.toLowerCase()) {
      case 'aws_s3':
      case 'aws s3':
        return <Storage />;
      case 'aws_iam':
      case 'aws iam':
        return <Security />;
      default:
        return <Cloud />;
    }
  };

  const formatStatus = (status: string) => {
    return status.replace('_', '-').toUpperCase();
  };

  const filteredItems = evidenceItems.filter(item => {
    const matchesStatus = filters.status === 'all' ||
      item.status.toLowerCase() === filters.status.toLowerCase();

    const matchesSource = filters.source === 'all' ||
      item.source.toLowerCase() === filters.source.toLowerCase();

    const matchesSearch = filters.searchTerm === '' ||
      item.type.toLowerCase().includes(filters.searchTerm.toLowerCase()) ||
      item.source.toLowerCase().includes(filters.searchTerm.toLowerCase()) ||
      item.status.toLowerCase().includes(filters.searchTerm.toLowerCase());

    return matchesStatus && matchesSource && matchesSearch;
  });

  const uniqueSources = Array.from(new Set(evidenceItems.map(item => item.source)));
  const uniqueStatuses = Array.from(new Set(evidenceItems.map(item => item.status)));

  if (loading) {
    return (
      <Card sx={{ height: '100%' }}>
        <CardHeader title="Evidence List" />
        <CardContent>
          <Typography>Loading evidence data...</Typography>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card sx={{ height: '100%', minHeight: 500 }}>
      <CardHeader
        title="Evidence List"
        subheader={`${filteredItems.length} items`}
        action={
          <Box sx={{ display: 'flex', gap: 1, alignItems: 'center' }}>
            <FilterList color="action" />
          </Box>
        }
      />

      <CardContent>
        {/* Filters */}
        <Box sx={{ mb: 3, display: 'flex', gap: 2, flexWrap: 'wrap' }}>
          <TextField
            size="small"
            placeholder="Search evidence..."
            name="searchTerm"
            value={filters.searchTerm}
            onChange={handleFilterChange as any}
            sx={{ minWidth: 200 }}
          />

          <FormControl size="small" sx={{ minWidth: 120 }}>
            <InputLabel>Status</InputLabel>
            <Select
              name="status"
              value={filters.status}
              onChange={handleFilterChange}
              label="Status"
            >
              <MenuItem value="all">All Status</MenuItem>
              {uniqueStatuses.map(status => (
                <MenuItem key={status} value={status}>
                  {formatStatus(status)}
                </MenuItem>
              ))}
            </Select>
          </FormControl>

          <FormControl size="small" sx={{ minWidth: 120 }}>
            <InputLabel>Source</InputLabel>
            <Select
              name="source"
              value={filters.source}
              onChange={handleFilterChange}
              label="Source"
            >
              <MenuItem value="all">All Sources</MenuItem>
              {uniqueSources.map(source => (
                <MenuItem key={source} value={source}>
                  {source.replace('_', ' ').toUpperCase()}
                </MenuItem>
              ))}
            </Select>
          </FormControl>
        </Box>

        {/* Evidence List */}
        <List sx={{ maxHeight: 400, overflow: 'auto' }}>
          {filteredItems.length === 0 ? (
            <Box sx={{ textAlign: 'center', py: 4 }}>
              <Typography color="text.secondary">
                No evidence items found matching current filters.
              </Typography>
            </Box>
          ) : (
            filteredItems.map((item) => (
              <React.Fragment key={item.id}>
                <Box
                  onClick={() => {
                    toggleExpanded(item.id);
                    onItemClick?.(item);
                  }}
                  sx={{
                    border: 1,
                    borderColor: 'divider',
                    borderRadius: 1,
                    mb: 1,
                    p: 2,
                    '&:hover': {
                      backgroundColor: 'action.hover'
                    },
                    cursor: 'pointer'
                  }}
                >
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                    <Box>
                      {getSourceIcon(item.source)}
                    </Box>
                    <Box sx={{ flex: 1 }}>
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
                        <Typography variant="subtitle2">
                          {item.type.replace('_', ' ').toUpperCase()}
                        </Typography>
                        <Chip
                          size="small"
                          label={formatStatus(item.status)}
                          color={getStatusColor(item.status) as 'success' | 'warning' | 'error' | 'default'}
                          variant="outlined"
                        />
                      </Box>
                      <Typography variant="body2" color="text.secondary">
                        Source: {item.source.replace('_', ' ')} •
                        {new Date(item.timestamp).toLocaleDateString()}
                      </Typography>
                    </Box>
                    <Box>
                      {expandedItems.has(item.id) ? <ExpandLess /> : <ExpandMore />}
                    </Box>
                  </Box>
                </Box>

                <Collapse in={expandedItems.has(item.id)} timeout="auto" unmountOnExit>
                  <Box sx={{ pl: 4, pr: 2, pb: 2 }}>
                    <Typography variant="body2" color="text.secondary" gutterBottom>
                      Evidence Details:
                    </Typography>
                    <Box sx={{
                      backgroundColor: 'rgba(0,0,0,0.02)',
                      p: 2,
                      borderRadius: 1,
                      fontFamily: 'monospace',
                      fontSize: '0.875rem'
                    }}>
                      <pre style={{ margin: 0, whiteSpace: 'pre-wrap' }}>
                        {JSON.stringify(item.data, null, 2)}
                      </pre>
                    </Box>
                  </Box>
                </Collapse>
              </React.Fragment>
            ))
          )}
        </List>
      </CardContent>
    </Card>
  );
};

export default EvidenceList;
