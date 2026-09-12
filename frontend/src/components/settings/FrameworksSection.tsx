import React from 'react';
import { Box, Paper, List, ListItem, ListItemText, Divider, Chip } from '@mui/material';
import { Shield } from '@mui/icons-material';
import SectionHeader from './SectionHeader';

/** Compliance Frameworks section: static framework status list. */
const FrameworksSection: React.FC = () => (
  <Paper sx={{ mb: 3 }}>
    <Box sx={{ p: 3 }}>
      <SectionHeader icon={<Shield color="primary" />} title="Compliance Frameworks" />

      <List disablePadding>
        <ListItem>
          <ListItemText
            primary="SOC 2 Type II"
            secondary="AICPA Trust Services Criteria (2017) — 43 criteria across the Common Criteria (CC), Availability (A), Confidentiality (C) and Processing Integrity (PI) categories"
          />
          <Chip label="Active" size="small" color="success" />
        </ListItem>
        <Divider component="li" />
        <ListItem>
          <ListItemText
            primary="ISO 27001"
            secondary="ISO/IEC 27001:2022 information security management — 93 Annex A controls across Organizational, People, Physical and Technological themes"
          />
          <Chip label="Active" size="small" color="success" />
        </ListItem>
        <Divider component="li" />
        <ListItem>
          <ListItemText
            primary="HIPAA"
            secondary="Health information privacy and security — 47 safeguards across 45 CFR Part 164"
          />
          <Chip label="Active" size="small" color="success" />
        </ListItem>
        <Divider component="li" />
        <ListItem>
          <ListItemText
            primary="GDPR"
            secondary="EU General Data Protection Regulation — 38 obligations across principles, data subject rights, controller duties and international transfers"
          />
          <Chip label="Active" size="small" color="success" />
        </ListItem>
        <Divider component="li" />
        <ListItem>
          <ListItemText
            primary="PCI DSS"
            secondary="Payment card industry data security"
          />
          <Chip label="Coming Soon" size="small" variant="outlined" />
        </ListItem>
      </List>
    </Box>
  </Paper>
);

export default FrameworksSection;
