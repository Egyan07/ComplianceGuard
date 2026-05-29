// electron/processing/remediation-scripts.js
// Static remediation map for SOC 2 controls.
// type: 'script' = automatable via PowerShell (requiresAdmin: true, reversible: true)
// type: 'guide'  = requires human action (policy docs, risk assessments)

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

  'CC6.5': {
    type: 'script',
    title: 'Network Security — Firewall Rules',
    estimatedSeconds: 20,
    reversible: true,
    requiresAdmin: true,
    scriptLines: [
      '# CC6.5 Remediation — ComplianceGuard',
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

  'CC7.1': {
    type: 'script',
    title: 'Event Logging — Security Log Configuration',
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
    title: 'Vulnerability Management — Defender + Windows Update',
    estimatedSeconds: 30,
    reversible: true,
    requiresAdmin: true,
    scriptLines: [
      '# CC7.2 Remediation — ComplianceGuard',
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

  'CC2.1': { type: 'guide', title: 'Communication and Information', scriptLines: [], reversible: false, requiresAdmin: false, estimatedSeconds: 0,
    guideSteps: ['Create an Information Security Policy.', 'Distribute to all staff via email and document sign-off.', 'Review annually.'] },

  'CC3.1': { type: 'guide', title: 'Risk Assessment', scriptLines: [], reversible: false, requiresAdmin: false, estimatedSeconds: 0,
    guideSteps: ['Conduct a formal risk assessment covering confidentiality, availability, and processing integrity.', 'Document findings in a Risk Register.', 'Review at least annually.'] },

  'CC4.1': { type: 'guide', title: 'Monitoring', scriptLines: [], reversible: false, requiresAdmin: false, estimatedSeconds: 0,
    guideSteps: ['Define monitoring procedures for your controls.', 'Document who reviews logs and how often.', 'Record evidence of reviews.'] },

  'CC5.1': { type: 'guide', title: 'Control Activities', scriptLines: [], reversible: false, requiresAdmin: false, estimatedSeconds: 0,
    guideSteps: ['Document your control activities aligned to risk assessment findings.', 'Assign owners to each control.', 'Review quarterly.'] },

  'CC6.4': { type: 'guide', title: 'Segregation of Duties', scriptLines: [], reversible: false, requiresAdmin: false, estimatedSeconds: 0,
    guideSteps: ['Document which roles have access to which systems.', 'Ensure no single person can both initiate and approve sensitive transactions.', 'Review access matrix annually.'] },

  'CC6.6': { type: 'guide', title: 'Physical Access', scriptLines: [], reversible: false, requiresAdmin: false, estimatedSeconds: 0,
    guideSteps: ['Document physical access controls to server rooms and offices.', 'Review visitor logs and badge access records.', 'Test physical security controls annually.'] },

  'CC6.7': { type: 'guide', title: 'Data Transmission', scriptLines: [], reversible: false, requiresAdmin: false, estimatedSeconds: 0,
    guideSteps: ['Ensure all data in transit uses TLS 1.2 or higher.', 'Document encryption standards in your Information Security Policy.', 'Run a TLS scanner against your endpoints.'] },

  'CC8.1': { type: 'guide', title: 'Change Management', scriptLines: [], reversible: false, requiresAdmin: false, estimatedSeconds: 0,
    guideSteps: ['Document a change management process covering testing, approval, and rollback.', 'Log all production changes with who approved them.', 'Review change log in monthly security review.'] },

  'CC9.1': { type: 'guide', title: 'Risk Mitigation', scriptLines: [], reversible: false, requiresAdmin: false, estimatedSeconds: 0,
    guideSteps: ['For each risk in your Risk Register, document a mitigation or acceptance decision.', 'Assign owners to high-priority risks.', 'Review mitigations quarterly.'] },

  'A1.1': { type: 'guide', title: 'System Availability', scriptLines: [], reversible: false, requiresAdmin: false, estimatedSeconds: 0,
    guideSteps: ['Document your uptime SLA and availability targets.', 'Set up uptime monitoring.', 'Review availability metrics monthly.'] },

  'A1.2': { type: 'guide', title: 'Environmental Protection', scriptLines: [], reversible: false, requiresAdmin: false, estimatedSeconds: 0,
    guideSteps: ['Document power, cooling, and physical environment controls for your infrastructure.', 'Verify your hosting provider\'s environmental certifications.', 'Review annually.'] },

  'A1.3': { type: 'guide', title: 'Capacity Management', scriptLines: [], reversible: false, requiresAdmin: false, estimatedSeconds: 0,
    guideSteps: ['Monitor CPU, memory, and storage utilisation.', 'Document capacity thresholds that trigger scaling.', 'Review capacity quarterly.'] },

  'A1.4': { type: 'guide', title: 'Backup and Recovery', scriptLines: [], reversible: false, requiresAdmin: false, estimatedSeconds: 0,
    guideSteps: ['Implement automated daily backups of all critical data.', 'Test restore at least quarterly — document results.', 'Define RPO and RTO targets in your DR plan.'] },

  'C1.1': { type: 'guide', title: 'Data Classification', scriptLines: [], reversible: false, requiresAdmin: false, estimatedSeconds: 0,
    guideSteps: ['Create a Data Classification Policy (Public / Internal / Confidential / Restricted).', 'Label all data stores according to classification.', 'Train staff on handling requirements per class.'] },

  'C1.2': { type: 'guide', title: 'Data Protection', scriptLines: [], reversible: false, requiresAdmin: false, estimatedSeconds: 0,
    guideSteps: ['Enable encryption at rest for databases and storage volumes.', 'Document encryption standards in your Information Security Policy.', 'Review key management procedures annually.'] },

  'C1.3': { type: 'guide', title: 'Data Disposal', scriptLines: [], reversible: false, requiresAdmin: false, estimatedSeconds: 0,
    guideSteps: ['Define a data retention and deletion policy.', 'Document how data is securely deleted.', 'Log all data disposal events.'] },

  'C1.4': { type: 'guide', title: 'Disclosure Controls', scriptLines: [], reversible: false, requiresAdmin: false, estimatedSeconds: 0,
    guideSteps: ['Define who is authorised to disclose confidential data externally.', 'Document NDA and data sharing agreement processes.', 'Review annually.'] },

  'PI1.1': { type: 'guide', title: 'Processing Accuracy', scriptLines: [], reversible: false, requiresAdmin: false, estimatedSeconds: 0,
    guideSteps: ['Document input validation rules for all data entry points.', 'Implement automated validation and error handling.', 'Review processing accuracy metrics quarterly.'] },

  'PI1.2': { type: 'guide', title: 'Input Controls', scriptLines: [], reversible: false, requiresAdmin: false, estimatedSeconds: 0,
    guideSteps: ['Document controls that prevent incomplete or incorrect data entry.', 'Implement form validation and type checking.', 'Test input controls in QA before releases.'] },

  'PI1.3': { type: 'guide', title: 'Error Detection', scriptLines: [], reversible: false, requiresAdmin: false, estimatedSeconds: 0,
    guideSteps: ['Implement error logging and alerting for all data processing pipelines.', 'Define error escalation procedures.', 'Review error logs weekly.'] },

  'PI1.4': { type: 'guide', title: 'Output Review', scriptLines: [], reversible: false, requiresAdmin: false, estimatedSeconds: 0,
    guideSteps: ['Define review procedures for system outputs before distribution.', 'Document who reviews outputs and sign-off requirements.', 'Log output review completions.'] },
};

module.exports = REMEDIATION_SCRIPTS;
