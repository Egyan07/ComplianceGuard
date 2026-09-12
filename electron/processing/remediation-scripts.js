// electron/processing/remediation-scripts.js
// Static remediation map for SOC 2 controls.
// type: 'script' = automatable via PowerShell (requiresAdmin: true, reversible: true)
// type: 'guide'  = requires human action (policy docs, risk assessments)
//
// Keys MUST stay in sync with the canonical shared/frameworks/soc2_controls.yaml
// (the real 2017 Trust Services Criteria: 33 CC + A1.1-A1.3 + C1.1-C1.2 +
// PI1.1-PI1.5 — 43 criteria). Scripts are attached only where the action
// genuinely supports the real criterion: A3.2/A1.5 (fabricated IDs) were
// re-mapped to CC6.6/CC6.8, and the audit-policy script formerly mislabeled
// CC6.3 now sits under CC7.2 where it substantively belongs.

const REMEDIATION_SCRIPTS = {

  // ── Automatable via PowerShell ─────────────────────────────────────────────

  'CC6.1': {
    type: 'script',
    title: 'Logical Access Security — Windows Firewall',
    estimatedSeconds: 15,
    reversible: true,
    requiresAdmin: true,
    scriptLines: [
      '# CC6.1 Remediation — ComplianceGuard',
      '# Enables Windows Firewall on all profiles (logical access security layer)',
      '# Reversible: netsh advfirewall set allprofiles state off',
      '',
      'netsh advfirewall set allprofiles state on',
      'netsh advfirewall set domainprofile state on',
      'netsh advfirewall set privateprofile state on',
      'netsh advfirewall set publicprofile state on',
      '',
      'Write-Host "Firewall enabled on all profiles." -ForegroundColor Green',
    ],
    guideSteps: [],
  },

  'CC6.2': {
    type: 'script',
    title: 'Credential Management — Password Policy',
    estimatedSeconds: 20,
    reversible: true,
    requiresAdmin: true,
    scriptLines: [
      '# CC6.2 Remediation — ComplianceGuard',
      '# Sets password policy: min 12 chars, complexity on, 90-day expiry',
      '# Reversible: restore prior policy via secedit or net accounts',
      '',
      '$inf = @"',
      '[Unicode]',
      'Unicode=yes',
      '[System Access]',
      'MinimumPasswordLength = 12',
      'MaximumPasswordAge = 90',
      'MinimumPasswordAge = 1',
      'PasswordHistorySize = 12',
      'PasswordComplexity = 1',
      '"@',
      '$inf | Set-Content "$env:TEMP\\cg-secpol.inf"',
      'secedit /configure /db "$env:TEMP\\cg-secpol.sdb" /cfg "$env:TEMP\\cg-secpol.inf" /areas SECURITYPOLICY',
      'if ($LASTEXITCODE -ne 0) { Write-Error "secedit failed with exit code $LASTEXITCODE"; exit 1 }',
      'Remove-Item "$env:TEMP\\cg-secpol.inf","$env:TEMP\\cg-secpol.sdb" -Force -ErrorAction SilentlyContinue',
      '',
      'Write-Host "Password policy updated." -ForegroundColor Green',
    ],
    guideSteps: [],
  },

  'CC6.6': {
    type: 'script',
    title: 'External Threat Protection — Network Firewall Rules',
    estimatedSeconds: 20,
    reversible: true,
    requiresAdmin: true,
    scriptLines: [
      '# CC6.6 Remediation — ComplianceGuard',
      '# Blocks insecure inbound ports (Telnet 23, FTP 21) and public RDP —',
      '# logical access measures against threats from outside system boundaries.',
      '# Reversible: netsh advfirewall firewall delete rule name="CG-Block-..."',
      '',
      'netsh advfirewall firewall add rule name="CG-Block-Telnet" protocol=TCP dir=in localport=23 action=block',
      'netsh advfirewall firewall add rule name="CG-Block-FTP" protocol=TCP dir=in localport=21 action=block',
      'netsh advfirewall firewall add rule name="CG-Block-RDP-Public" protocol=TCP dir=in localport=3389 profile=public action=block',
      '',
      'Write-Host "Network firewall rules applied." -ForegroundColor Green',
    ],
    guideSteps: [],
  },

  'CC6.8': {
    type: 'script',
    title: 'Malicious Software Controls — Defender + Windows Update',
    estimatedSeconds: 30,
    reversible: true,
    requiresAdmin: true,
    scriptLines: [
      '# CC6.8 Remediation — ComplianceGuard',
      '# Enables Windows Defender real-time protection and automatic updates',
      '# Reversible: Set-MpPreference -DisableRealtimeMonitoring $true',
      '',
      'Set-MpPreference -DisableRealtimeMonitoring $false',
      'Set-MpPreference -DisableIOAVProtection $false',
      'Set-MpPreference -DisableBehaviorMonitoring $false',
      '',
      'sc config wuauserv start= auto',
      'Start-Service wuauserv -ErrorAction SilentlyContinue',
      '',
      'Write-Host "Defender and Windows Update enabled." -ForegroundColor Green',
    ],
    guideSteps: [],
  },

  'CC7.1': {
    type: 'script',
    title: 'Vulnerability Detection — Security Event Log',
    estimatedSeconds: 10,
    reversible: true,
    requiresAdmin: true,
    scriptLines: [
      '# CC7.1 Remediation — ComplianceGuard',
      '# Configures Security event log: 100MB max, overwrite-as-needed retention',
      '# Reversible: wevtutil sl Security /ms:20971520',
      '',
      'wevtutil sl Security /ms:104857600',
      'wevtutil sl Security /rt:false',
      'auditpol /set /subcategory:"Logon" /success:enable /failure:enable',
      'auditpol /set /subcategory:"Process Creation" /success:enable',
      '',
      'Write-Host "Security event log configured." -ForegroundColor Green',
    ],
    guideSteps: [],
  },

  'CC7.2': {
    type: 'script',
    title: 'Anomaly Monitoring — Audit Policy',
    estimatedSeconds: 30,
    reversible: true,
    requiresAdmin: true,
    scriptLines: [
      '# CC7.2 Remediation — ComplianceGuard',
      '# Enables audit logging for logon events and account management so',
      '# component activity can be monitored for anomalies.',
      '# Reversible: auditpol /set /subcategory:"Logon" /success:disable /failure:disable',
      '',
      'auditpol /set /subcategory:"Logon" /success:enable /failure:enable',
      'auditpol /set /subcategory:"Account Management" /success:enable /failure:enable',
      'auditpol /set /subcategory:"Account Logon" /success:enable /failure:enable',
      '',
      'Write-Host "Audit policy configured for logon and account events." -ForegroundColor Green',
    ],
    guideSteps: [],
  },

  // ── Guidance only (policy/process controls) ────────────────────────────────

  'CC1.1': { type: 'guide', title: 'Integrity and Ethical Values', scriptLines: [], reversible: false, requiresAdmin: false, estimatedSeconds: 0,
    guideSteps: ['Write a Code of Conduct policy covering integrity, ethics, and accountability.', 'Distribute it to all staff and record acknowledgement.', 'Review annually.'] },

  'CC1.2': { type: 'guide', title: 'Board Oversight and Independence', scriptLines: [], reversible: false, requiresAdmin: false, estimatedSeconds: 0,
    guideSteps: ['Document your board/oversight structure and independence criteria.', 'Ensure at least one independent board member or advisor.', 'Record meeting minutes showing oversight of internal control.'] },

  'CC1.3': { type: 'guide', title: 'Organizational Structure and Reporting Lines', scriptLines: [], reversible: false, requiresAdmin: false, estimatedSeconds: 0,
    guideSteps: ['Document org structure, reporting lines, and authorities.', 'Assign security responsibilities to named roles.', 'Review structures when the organization changes.'] },

  'CC1.4': { type: 'guide', title: 'Commitment to Competence', scriptLines: [], reversible: false, requiresAdmin: false, estimatedSeconds: 0,
    guideSteps: ['Document competency requirements for security-relevant roles.', 'Define and record a training program for staff.', 'Review the competency framework annually.'] },

  'CC1.5': { type: 'guide', title: 'Individual Accountability', scriptLines: [], reversible: false, requiresAdmin: false, estimatedSeconds: 0,
    guideSteps: ['Embed internal-control responsibilities in role descriptions.', 'Hold performance reviews that cover control responsibilities.', 'Enforce accountability through a documented process.'] },

  'CC2.1': { type: 'guide', title: 'Quality of Information', scriptLines: [], reversible: false, requiresAdmin: false, estimatedSeconds: 0,
    guideSteps: ['Create an Information Security Policy.', 'Identify the information internal control needs and its quality criteria.', 'Review the policy and information flows annually.'] },

  'CC2.2': { type: 'guide', title: 'Internal Communication', scriptLines: [], reversible: false, requiresAdmin: false, estimatedSeconds: 0,
    guideSteps: ['Communicate security objectives and responsibilities to all staff.', 'Record acknowledgement of policies.', 'Review communication channels annually.'] },

  'CC2.3': { type: 'guide', title: 'External Communication', scriptLines: [], reversible: false, requiresAdmin: false, estimatedSeconds: 0,
    guideSteps: ['Document external communication protocols for incidents and security matters.', 'Define who communicates with external parties.', 'Record external communications.'] },

  'CC3.1': { type: 'guide', title: 'Objectives Specification', scriptLines: [], reversible: false, requiresAdmin: false, estimatedSeconds: 0,
    guideSteps: ['Document business and reporting objectives with sufficient clarity.', 'Ensure objectives enable identification and assessment of risks.', 'Review objectives at planning cycles.'] },

  'CC3.2': { type: 'guide', title: 'Risk Identification and Analysis', scriptLines: [], reversible: false, requiresAdmin: false, estimatedSeconds: 0,
    guideSteps: ['Conduct a formal risk assessment across the entity.', 'Document findings in a Risk Register with a likelihood × impact analysis.', 'Assign owners to each identified risk and review at least annually.'] },

  'CC3.3': { type: 'guide', title: 'Fraud Consideration', scriptLines: [], reversible: false, requiresAdmin: false, estimatedSeconds: 0,
    guideSteps: ['Include fraud scenarios in the risk assessment process.', 'Document the fraud risk analysis.', 'Update the analysis annually and after significant change.'] },

  'CC3.4': { type: 'guide', title: 'Change Risk Assessment', scriptLines: [], reversible: false, requiresAdmin: false, estimatedSeconds: 0,
    guideSteps: ['Monitor internal and external change drivers.', 'Reassess risk when significant change occurs.', 'Document change-driven risk assessments.'] },

  'CC4.1': { type: 'guide', title: 'Ongoing and Separate Evaluations', scriptLines: [], reversible: false, requiresAdmin: false, estimatedSeconds: 0,
    guideSteps: ['Define monitoring procedures for your controls (ongoing evaluation).', 'Schedule periodic separate evaluations such as internal audits.', 'Record evidence of both kinds of review.'] },

  'CC4.2': { type: 'guide', title: 'Evaluation and Communication of Deficiencies', scriptLines: [], reversible: false, requiresAdmin: false, estimatedSeconds: 0,
    guideSteps: ['Track identified control deficiencies with owners.', 'Report deficiencies to management and the board as appropriate.', 'Document corrective actions to closure.'] },

  'CC5.1': { type: 'guide', title: 'Selection of Control Activities', scriptLines: [], reversible: false, requiresAdmin: false, estimatedSeconds: 0,
    guideSteps: ['Map control activities to assessed risks.', 'Assign owners to each control.', 'Review the mapping quarterly.'] },

  'CC5.2': { type: 'guide', title: 'General Controls over Technology', scriptLines: [], reversible: false, requiresAdmin: false, estimatedSeconds: 0,
    guideSteps: ['Define general technology controls: access management, operations, change.', 'Evidence their operation.', 'Review control design annually.'] },

  'CC5.3': { type: 'guide', title: 'Deployment Through Policies and Procedures', scriptLines: [], reversible: false, requiresAdmin: false, estimatedSeconds: 0,
    guideSteps: ['Pair each security policy with operating procedures.', 'Train personnel on policies and procedures.', 'Review both annually.'] },

  'CC6.3': { type: 'guide', title: 'Access Authorization and Modification', scriptLines: [], reversible: false, requiresAdmin: false, estimatedSeconds: 0,
    guideSteps: ['Authorize, modify, or remove access based on documented roles.', 'Apply least privilege and segregation of duties.', 'Review role assignments and privilege levels periodically.'] },

  'CC6.4': { type: 'guide', title: 'Physical Access Restrictions', scriptLines: [], reversible: false, requiresAdmin: false, estimatedSeconds: 0,
    guideSteps: ['Document physical access controls to facilities and sensitive locations.', 'Control entry with badge/visitor logs.', 'Review physical access rights periodically.'] },

  'CC6.5': { type: 'guide', title: 'Disposal of Physical Assets', scriptLines: [], reversible: false, requiresAdmin: false, estimatedSeconds: 0,
    guideSteps: ['Follow a media sanitization/disposal policy.', 'Retain disposal certificates.', 'Verify data recovery is not possible before disposing of assets.'] },

  'CC6.7': { type: 'guide', title: 'Restriction of Information Transmission', scriptLines: [], reversible: false, requiresAdmin: false, estimatedSeconds: 0,
    guideSteps: ['Restrict transmission of information to authorized users and processes.', 'Enforce encryption in transit.', 'Review open ports and network services that move data off the endpoint.'] },

  'CC7.3': { type: 'guide', title: 'Security Event Evaluation', scriptLines: [], reversible: false, requiresAdmin: false, estimatedSeconds: 0,
    guideSteps: ['Define evaluation criteria for security events.', 'Record triage outcomes for evaluated events.', 'Act on events determined to be security incidents.'] },

  'CC7.4': { type: 'guide', title: 'Incident Response', scriptLines: [], reversible: false, requiresAdmin: false, estimatedSeconds: 0,
    guideSteps: ['Maintain a defined incident-response program.', 'Define roles, containment, remediation, and communication procedures.', 'Run an incident-response drill annually and retain records.'] },

  'CC7.5': { type: 'guide', title: 'Recovery from Security Incidents', scriptLines: [], reversible: false, requiresAdmin: false, estimatedSeconds: 0,
    guideSteps: ['Identify and develop recovery activities for security incidents.', 'Retain backup/restore evidence.', 'Document post-incident recovery actions to closure.'] },

  'CC8.1': { type: 'guide', title: 'Change Management', scriptLines: [], reversible: false, requiresAdmin: false, estimatedSeconds: 0,
    guideSteps: ['Document a change management process covering testing, approval, and rollback.', 'Log all production changes with who approved them.', 'Review the change log in monthly security reviews.'] },

  'CC9.1': { type: 'guide', title: 'Business Disruption Risk Mitigation', scriptLines: [], reversible: false, requiresAdmin: false, estimatedSeconds: 0,
    guideSteps: ['For each disruption risk, document a mitigation or acceptance decision.', 'Assign owners to high-priority risks.', 'Review mitigations quarterly.'] },

  'CC9.2': { type: 'guide', title: 'Vendor and Business Partner Risk', scriptLines: [], reversible: false, requiresAdmin: false, estimatedSeconds: 0,
    guideSteps: ['Assess vendor security before onboarding and annually thereafter.', 'Include security commitments in vendor contracts.', 'Maintain a vendor register with review dates.'] },

  'A1.1': { type: 'guide', title: 'Processing Capacity Management', scriptLines: [], reversible: false, requiresAdmin: false, estimatedSeconds: 0,
    guideSteps: ['Monitor processing capacity and component utilisation.', 'Document thresholds that trigger capacity action.', 'Review capacity metrics periodically.'] },

  'A1.2': { type: 'guide', title: 'Environmental Protections, Backup, and Recovery Infrastructure', scriptLines: [], reversible: false, requiresAdmin: false, estimatedSeconds: 0,
    guideSteps: ['Implement automated data backups for all critical data.', 'Document environmental protections for your infrastructure.', 'Monitor backup processes and recovery infrastructure.'] },

  'A1.3': { type: 'guide', title: 'Recovery Plan Testing', scriptLines: [], reversible: false, requiresAdmin: false, estimatedSeconds: 0,
    guideSteps: ['Test recovery procedures at least quarterly.', 'Document test results and gaps found.', 'Define RPO and RTO targets in your DR plan.'] },

  'C1.1': { type: 'guide', title: 'Identification and Maintenance of Confidential Information', scriptLines: [], reversible: false, requiresAdmin: false, estimatedSeconds: 0,
    guideSteps: ['Create a Confidentiality Policy defining protected information.', 'Maintain a data classification scheme (Public / Internal / Confidential / Restricted).', 'Train staff on handling requirements per class.'] },

  'C1.2': { type: 'guide', title: 'Disposal of Confidential Information', scriptLines: [], reversible: false, requiresAdmin: false, estimatedSeconds: 0,
    guideSteps: ['Define a data disposal policy covering deletion and media sanitisation.', 'Document how confidential data is securely deleted.', 'Log all data disposal events.'] },

  'PI1.1': { type: 'guide', title: 'Processing Information Quality', scriptLines: [], reversible: false, requiresAdmin: false, estimatedSeconds: 0,
    guideSteps: ['Document definitions of data processed and product/service specifications.', 'Communicate them to the teams that rely on them.', 'Review specifications at planning cycles.'] },

  'PI1.2': { type: 'guide', title: 'Input Completeness and Accuracy', scriptLines: [], reversible: false, requiresAdmin: false, estimatedSeconds: 0,
    guideSteps: ['Document input validation rules for all data entry points.', 'Implement automated validation and error handling.', 'Review input-control coverage before releases.'] },

  'PI1.3': { type: 'guide', title: 'System Processing Controls', scriptLines: [], reversible: false, requiresAdmin: false, estimatedSeconds: 0,
    guideSteps: ['Document data processing procedures.', 'Implement processing validation checkpoints.', 'Review processing procedures annually.'] },

  'PI1.4': { type: 'guide', title: 'Output Delivery', scriptLines: [], reversible: false, requiresAdmin: false, estimatedSeconds: 0,
    guideSteps: ['Define review procedures for system outputs before distribution.', 'Document who reviews outputs and sign-off requirements.', 'Log output review completions.'] },

  'PI1.5': { type: 'guide', title: 'Storage of Inputs and Outputs', scriptLines: [], reversible: false, requiresAdmin: false, estimatedSeconds: 0,
    guideSteps: ['Document storage procedures for inputs, in-process items, and outputs.', 'Define retention controls per storage class.', 'Review storage procedures annually.'] },
};

module.exports = REMEDIATION_SCRIPTS;
