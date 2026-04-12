const FREE_TIER_CONTROL_IDS = [
  'CC1.1', 'CC2.1', 'CC3.1', 'CC4.1', 'CC5.1',
  'CC6.1', 'CC6.2', 'CC6.5',
  'CC7.1', 'CC7.2', 'CC8.1',
  'A1.1',
];

const ALL_CONTROL_IDS = [
  'CC1.1', 'CC1.2', 'CC2.1', 'CC3.1', 'CC4.1', 'CC5.1',
  'CC6.1', 'CC6.2', 'CC6.3', 'CC6.4', 'CC6.5', 'CC6.6', 'CC6.7',
  'CC7.1', 'CC7.2', 'CC8.1', 'CC9.1',
  'A1.1', 'A1.2', 'A1.3', 'A1.4',
  'C1.1', 'C1.2', 'C1.3', 'C1.4',
  'PI1.1', 'PI1.2', 'PI1.3', 'PI1.4',
];

const FEATURE_GATES = {
  all_controls:        { free: false, pro: true },
  per_control_scoring: { free: false, pro: true },
  remediation:         { free: false, pro: true },
  pdf_reports:         { free: false, pro: true },
  evidence_upload:     { free: false, pro: true },
  evaluation_history:  { free: false, pro: true },
};

module.exports = { FREE_TIER_CONTROL_IDS, ALL_CONTROL_IDS, FEATURE_GATES };
