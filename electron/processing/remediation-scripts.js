// electron/processing/remediation-scripts.js
// Static remediation map for SOC 2 controls.
// type: 'script' = automatable via PowerShell (requiresAdmin: true, reversible: true)
// type: 'guide'  = requires human action (policy docs, risk assessments)
//
// Keep keys in sync with electron/data/soc2_controls.yaml (54 controls).

const REMEDIATION_SCRIPTS = {

  // ── Automatable via PowerShell ─────────────────────────────────────────────

  'CC6.1': {
    type: 'script',
    title: 'Logical Access Controls — Windows Firewall',
    estimatedSeconds: 15,
    reversible: true,
    requiresAdmin: true,
    scriptLines: [
      '# CC6.1 Remediation — ComplianceGuard',
      '# Enables Windows Firewall on all profiles',
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
    title: 'Authentication — Password Policy',
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

  'CC6.3': {
    type: 'script',
    title: 'Authorization Controls — Audit Policy',
    estimatedSeconds: 30,
    reversible: true,
    requiresAdmin: true,
    scriptLines: [
      '# CC6.3 Remediation — ComplianceGuard',
      '# Enables audit logging for logon events and account management',
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

  'CC7.1': {
    type: 'script',
    title: 'System Operations — Security Event Log',
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

  'A3.2': {
    type: 'script',
    title: 'Firewall Management — Network Firewall Rules',
    estimatedSeconds: 20,
    reversible: true,
    requiresAdmin: true,
    scriptLines: [
      '# A3.2 Remediation — ComplianceGuard',
      '# Blocks insecure inbound ports (Telnet 23, FTP 21)',
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

  'A1.5': {
    type: 'script',
    title: 'System Performance Monitoring — Defender + Windows Update',
    estimatedSeconds: 30,
    reversible: true,
    requiresAdmin: true,
    scriptLines: [
      '# A1.5 Remediation — ComplianceGuard',
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

  // ── Guidance only (policy/process controls) ────────────────────────────────

  'CC1.1': { type: 'guide', title: 'Control Environment', scriptLines: [], reversible: false, requiresAdmin: false, estimatedSeconds: 0,
    guideSteps: ['Write a Code of Conduct policy covering integrity, ethics, and accountability.', 'Distribute it to all staff and record acknowledgement.', 'Review annually.'] },

  'CC1.2': { type: 'guide', title: 'Board Independence', scriptLines: [], reversible: false, requiresAdmin: false, estimatedSeconds: 0,
    guideSteps: ['Document your board/oversight structure.', 'Ensure at least one independent board member or advisor.', 'Record meeting minutes.'] },

  'CC1.3': { type: 'guide', title: 'Management Philosophy', scriptLines: [], reversible: false, requiresAdmin: false, estimatedSeconds: 0,
    guideSteps: ['Document competency requirements for security-relevant roles.', 'Define and record a training program for staff.', 'Review competency framework annually.'] },

  'CC2.1': { type: 'guide', title: 'Communication and Information', scriptLines: [], reversible: false, requiresAdmin: false, estimatedSeconds: 0,
    guideSteps: ['Create an Information Security Policy.', 'Distribute to all staff via email and document sign-off.', 'Review annually.'] },

  'CC2.2': { type: 'guide', title: 'Information Quality', scriptLines: [], reversible: false, requiresAdmin: false, estimatedSeconds: 0,
    guideSteps: ['Document information systems and data flows.', 'Define quality criteria for security-relevant information.', 'Record how information supports control operations.'] },

  'CC2.3': { type: 'guide', title: 'External Communication', scriptLines: [], reversible: false, requiresAdmin: false, estimatedSeconds: 0,
    guideSteps: ['Document external communication protocols for incidents and security matters.', 'Define who communicates with external parties.', 'Record external communications.'] },

  'CC3.1': { type: 'guide', title: 'Risk Assessment Process', scriptLines: [], reversible: false, requiresAdmin: false, estimatedSeconds: 0,
    guideSteps: ['Conduct a formal risk assessment covering confidentiality, availability, and processing integrity.', 'Document findings in a Risk Register.', 'Review at least annually.'] },

  'CC3.2': { type: 'guide', title: 'Risk Identification', scriptLines: [], reversible: false, requiresAdmin: false, estimatedSeconds: 0,
    guideSteps: ['Maintain a comprehensive risk register.', 'Identify risks to achievement of objectives quarterly.', 'Assign owners to each identified risk.'] },

  'CC3.3': { type: 'guide', title: 'Risk Analysis', scriptLines: [], reversible: false, requiresAdmin: false, estimatedSeconds: 0,
    guideSteps: ['Document a risk analysis methodology (likelihood × impact).', 'Produce risk analysis reports.', 'Update impact assessments annually.'] },

  'CC4.1': { type: 'guide', title: 'Monitoring Activities', scriptLines: [], reversible: false, requiresAdmin: false, estimatedSeconds: 0,
    guideSteps: ['Define monitoring procedures for your controls.', 'Document who reviews logs and how often.', 'Record evidence of reviews.'] },

  'CC4.2': { type: 'guide', title: 'Separate Evaluations', scriptLines: [], reversible: false, requiresAdmin: false, estimatedSeconds: 0,
    guideSteps: ['Schedule periodic separate evaluations of controls.', 'Commission internal or external audit assessments.', 'Document findings and remediation.'] },

  'CC5.1': { type: 'guide', title: 'Control Activities', scriptLines: [], reversible: false, requiresAdmin: false, estimatedSeconds: 0,
    guideSteps: ['Document your control activities aligned to risk assessment findings.', 'Assign owners to each control.', 'Review quarterly.'] },

  'CC5.2': { type: 'guide', title: 'Control Activities Development', scriptLines: [], reversible: false, requiresAdmin: false, estimatedSeconds: 0,
    guideSteps: ['Build a risk control matrix mapping risks to controls.', 'Design controls to address specific risks.', 'Review control design annually.'] },

  'CC8.1': { type: 'guide', title: 'Change Management', scriptLines: [], reversible: false, requiresAdmin: false, estimatedSeconds: 0,
    guideSteps: ['Document a change management process covering testing, approval, and rollback.', 'Log all production changes with who approved them.', 'Review change log in monthly security review.'] },

  'CC9.1': { type: 'guide', title: 'Risk Mitigation', scriptLines: [], reversible: false, requiresAdmin: false, estimatedSeconds: 0,
    guideSteps: ['For each risk in your Risk Register, document a mitigation or acceptance decision.', 'Assign owners to high-priority risks.', 'Review mitigations quarterly.'] },

  'A1.1': { type: 'guide', title: 'Availability Policies and Procedures', scriptLines: [], reversible: false, requiresAdmin: false, estimatedSeconds: 0,
    guideSteps: ['Document your uptime SLA and availability targets.', 'Set up uptime monitoring.', 'Review availability metrics monthly.'] },

  'A1.2': { type: 'guide', title: 'Capacity Management', scriptLines: [], reversible: false, requiresAdmin: false, estimatedSeconds: 0,
    guideSteps: ['Monitor CPU, memory, and storage utilisation.', 'Document capacity thresholds that trigger scaling.', 'Review capacity quarterly.'] },

  'A1.3': { type: 'guide', title: 'Backup and Recovery', scriptLines: [], reversible: false, requiresAdmin: false, estimatedSeconds: 0,
    guideSteps: ['Implement automated daily backups of all critical data.', 'Test restore at least quarterly — document results.', 'Define RPO and RTO targets in your DR plan.'] },

  'A1.4': { type: 'guide', title: 'Incident Response', scriptLines: [], reversible: false, requiresAdmin: false, estimatedSeconds: 0,
    guideSteps: ['Document an availability incident response plan.', 'Define escalation paths and on-call rota.', 'Run an incident response drill annually.'] },

  'A2.1': { type: 'guide', title: 'Environmental Controls', scriptLines: [], reversible: false, requiresAdmin: false, estimatedSeconds: 0,
    guideSteps: ['Document power, cooling, and physical environment controls for your infrastructure.', 'Verify your hosting provider\'s environmental certifications.', 'Review annually.'] },

  'A2.2': { type: 'guide', title: 'Facility Access', scriptLines: [], reversible: false, requiresAdmin: false, estimatedSeconds: 0,
    guideSteps: ['Document physical access controls to server rooms and offices.', 'Review visitor logs and badge access records.', 'Test physical security controls annually.'] },

  'A3.1': { type: 'guide', title: 'Network Security', scriptLines: [], reversible: false, requiresAdmin: false, estimatedSeconds: 0,
    guideSteps: ['Document a network security policy.', 'Review open ports and firewall rules.', 'Run an external port scan and remediate exposures.'] },

  'C1.1': { type: 'guide', title: 'Confidentiality Policies', scriptLines: [], reversible: false, requiresAdmin: false, estimatedSeconds: 0,
    guideSteps: ['Create a Confidentiality Policy defining protected information.', 'Document access control and authorization procedures.', 'Review confidentiality controls annually.'] },

  'C1.2': { type: 'guide', title: 'Data Classification', scriptLines: [], reversible: false, requiresAdmin: false, estimatedSeconds: 0,
    guideSteps: ['Create a Data Classification Policy (Public / Internal / Confidential / Restricted).', 'Label all data stores according to classification.', 'Train staff on handling requirements per class.'] },

  'C1.3': { type: 'guide', title: 'Encryption Controls', scriptLines: [], reversible: false, requiresAdmin: false, estimatedSeconds: 0,
    guideSteps: ['Enable encryption at rest for databases and storage volumes.', 'Document encryption standards in your Information Security Policy.', 'Review key management procedures annually.'] },

  'C1.4': { type: 'guide', title: 'Data Masking', scriptLines: [], reversible: false, requiresAdmin: false, estimatedSeconds: 0,
    guideSteps: ['Define masking/redaction procedures for sensitive data in non-production environments.', 'Document who can access unmasked data.', 'Review masking procedures annually.'] },

  'C2.1': { type: 'guide', title: 'Confidentiality Agreements', scriptLines: [], reversible: false, requiresAdmin: false, estimatedSeconds: 0,
    guideSteps: ['Obtain signed confidentiality agreements from all personnel.', 'Require NDAs from third parties with data access.', 'Track agreement expiry and re-sign.'] },

  'C2.2': { type: 'guide', title: 'Data Retention', scriptLines: [], reversible: false, requiresAdmin: false, estimatedSeconds: 0,
    guideSteps: ['Define a data retention and deletion policy.', 'Document retention periods per data class.', 'Automate retention enforcement where possible.'] },

  'C2.3': { type: 'guide', title: 'Data Disposal', scriptLines: [], reversible: false, requiresAdmin: false, estimatedSeconds: 0,
    guideSteps: ['Define a data disposal policy covering deletion and media sanitisation.', 'Document how data is securely deleted.', 'Log all data disposal events.'] },

  'C3.1': { type: 'guide', title: 'Third Party Confidentiality', scriptLines: [], reversible: false, requiresAdmin: false, estimatedSeconds: 0,
    guideSteps: ['Include confidentiality clauses in third-party agreements.', 'Assess vendors handling confidential data.', 'Review third-party agreements annually.'] },

  'C3.2': { type: 'guide', title: 'Confidentiality Monitoring', scriptLines: [], reversible: false, requiresAdmin: false, estimatedSeconds: 0,
    guideSteps: ['Monitor access to confidential data.', 'Review access logs quarterly for anomalies.', 'Document monitoring reports.'] },

  'PI1.1': { type: 'guide', title: 'Processing Integrity Controls', scriptLines: [], reversible: false, requiresAdmin: false, estimatedSeconds: 0,
    guideSteps: ['Document input validation rules for all data entry points.', 'Implement automated validation and error handling.', 'Review processing accuracy metrics quarterly.'] },

  'PI1.2': { type: 'guide', title: 'Quality Assurance', scriptLines: [], reversible: false, requiresAdmin: false, estimatedSeconds: 0,
    guideSteps: ['Document QA procedures for processing systems.', 'Maintain test results and reports.', 'Review QA coverage before releases.'] },

  'PI1.3': { type: 'guide', title: 'Input Validation', scriptLines: [], reversible: false, requiresAdmin: false, estimatedSeconds: 0,
    guideSteps: ['Document controls that prevent incomplete or incorrect data entry.', 'Implement form validation and type checking.', 'Test input controls in QA before releases.'] },

  'PI1.4': { type: 'guide', title: 'Processing Controls', scriptLines: [], reversible: false, requiresAdmin: false, estimatedSeconds: 0,
    guideSteps: ['Document data processing procedures.', 'Implement processing validation checkpoints.', 'Review processing procedures annually.'] },

  'PI1.5': { type: 'guide', title: 'Output Validation', scriptLines: [], reversible: false, requiresAdmin: false, estimatedSeconds: 0,
    guideSteps: ['Define review procedures for system outputs before distribution.', 'Document who reviews outputs and sign-off requirements.', 'Log output review completions.'] },

  'PI2.1': { type: 'guide', title: 'Error Handling', scriptLines: [], reversible: false, requiresAdmin: false, estimatedSeconds: 0,
    guideSteps: ['Implement error logging and alerting for all data processing pipelines.', 'Define error escalation procedures.', 'Review error logs weekly.'] },

  'PI2.2': { type: 'guide', title: 'Transaction Integrity', scriptLines: [], reversible: false, requiresAdmin: false, estimatedSeconds: 0,
    guideSteps: ['Document transaction validation controls.', 'Implement transaction logging.', 'Reconcile transaction logs against source systems.'] },

  'PI3.1': { type: 'guide', title: 'Processing Monitoring', scriptLines: [], reversible: false, requiresAdmin: false, estimatedSeconds: 0,
    guideSteps: ['Implement monitoring of processing activities.', 'Define alert thresholds for processing anomalies.', 'Review monitoring reports daily.'] },

  'PI3.2': { type: 'guide', title: 'Exception Reporting', scriptLines: [], reversible: false, requiresAdmin: false, estimatedSeconds: 0,
    guideSteps: ['Define exception reporting procedures for processing failures.', 'Document how exceptions are tracked to resolution.', 'Review exception reports.'] },

  'CA1.1': { type: 'guide', title: 'Confidentiality and Availability Management', scriptLines: [], reversible: false, requiresAdmin: false, estimatedSeconds: 0,
    guideSteps: ['Produce an integrated security plan covering both confidentiality and availability.', 'Align plan to business requirements.', 'Review the plan annually.'] },

  'CA1.2': { type: 'guide', title: 'Incident Response', scriptLines: [], reversible: false, requiresAdmin: false, estimatedSeconds: 0,
    guideSteps: ['Document an incident response plan.', 'Define roles, escalation, and communication procedures.', 'Conduct an incident response drill annually.'] },

  'CA1.3': { type: 'guide', title: 'Security Awareness Training', scriptLines: [], reversible: false, requiresAdmin: false, estimatedSeconds: 0,
    guideSteps: ['Deliver security awareness training to all personnel.', 'Record completion and re-training dates.', 'Train on phishing and data handling annually.'] },

  'CA1.4': { type: 'guide', title: 'Physical Security', scriptLines: [], reversible: false, requiresAdmin: false, estimatedSeconds: 0,
    guideSteps: ['Document physical security controls for facilities and equipment.', 'Control access to sensitive areas with badge/visitor logs.', 'Review physical security annually.'] },

  'CA1.5': { type: 'guide', title: 'Vendor Management', scriptLines: [], reversible: false, requiresAdmin: false, estimatedSeconds: 0,
    guideSteps: ['Document vendor onboarding and risk assessment procedures.', 'Assess vendor security annually.', 'Maintain a vendor register with contract expiry.'] },

  'CA1.6': { type: 'guide', title: 'Change Management', scriptLines: [], reversible: false, requiresAdmin: false, estimatedSeconds: 0,
    guideSteps: ['Document change management procedures covering testing and approval.', 'Log all changes with owners and dates.', 'Review the change log in security meetings.'] },

  'CA1.7': { type: 'guide', title: 'Business Continuity', scriptLines: [], reversible: false, requiresAdmin: false, estimatedSeconds: 0,
    guideSteps: ['Develop and maintain a business continuity plan.', 'Define RPO/RTO for critical systems.', 'Test the continuity plan annually.'] },

  'CA1.8': { type: 'guide', title: 'Security Monitoring', scriptLines: [], reversible: false, requiresAdmin: false, estimatedSeconds: 0,
    guideSteps: ['Implement security event monitoring and alerting.', 'Define alert triage and response procedures.', 'Review monitoring logs regularly.'] },
};

module.exports = REMEDIATION_SCRIPTS;
