/**
 * Unit tests for electron/processing/report-generator.js.
 *
 * Tests the ReportGenerator class and its HTML report generation, including
 * helper functions (escapeHtml, buildReportId, scoreColor, etc.) exercised
 * through the public generateHTMLReport method.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import ReportGenerator from './report-generator.js';

// ── Mock database factory ──────────────────────────────────────────────────
function makeMockDb(overrides = {}) {
  return {
    getFrameworkById: vi.fn(async (id) => overrides.framework || {
      id,
      name: 'SOC 2 Type II',
      version: '2017',
    }),
    getLatestEvaluation: vi.fn(async () => overrides.evaluation || {
      overall_score: 75,
      status: 'partial',
      findings: {
        overall_score: 75,
        status: 'partial',
        total_controls: 54,
        compliant_controls: 30,
        non_compliant_controls: 10,
        partial_controls: 8,
        not_assessed_controls: 6,
        category_scores: {
          CC: { score: 80, control_count: 20 },
          A: { score: 60, control_count: 5 },
        },
        control_results: {
          'CC1.1': {
            control_id: 'CC1.1',
            control_title: 'Control Environment',
            control_category: 'CC',
            control_description: 'The entity demonstrates a commitment to integrity.',
            status: 'compliant',
            score: 100,
            evidence_count: 2,
            evidence_details: [
              { title: 'Code of Conduct', type: 'policy_document', collected_at: '2025-01-15T10:00:00Z' },
            ],
            gaps: [],
            required_evidence: ['policy_document'],
            available_evidence: ['policy_document'],
          },
          'CC6.1': {
            control_id: 'CC6.1',
            control_title: 'Logical Access Controls',
            control_category: 'CC',
            status: 'non_compliant',
            score: 0,
            evidence_count: 0,
            evidence_details: [],
            gaps: ['system_configs', 'security_policies'],
            required_evidence: ['system_configs', 'security_policies'],
            available_evidence: [],
          },
        },
        recommendations: [
          {
            control_id: 'CC6.1',
            priority: 'high',
            recommendation: 'No evidence collected. Gather system_configs and security_policies.',
            evidence_needed: ['system_configs', 'security_policies'],
          },
        ],
      },
    }),
    getEvidenceByFramework: vi.fn(async () => overrides.evidence || [
      { id: 1, control_id: 'CC1.1', evidence_type: 'policy_document', title: 'CoC', description: '', collected_at: '2025-01-15T10:00:00Z', file_path: null, metadata: {} },
    ]),
    getRemediationPlan: overrides.remediationPlan !== undefined
      ? vi.fn(async () => overrides.remediationPlan)
      : undefined,
  };
}

describe('ReportGenerator', () => {
  let gen;

  beforeEach(() => {
    gen = new ReportGenerator(makeMockDb());
  });

  it('throws when framework is not found', async () => {
    const db = makeMockDb();
    db.getFrameworkById.mockResolvedValue(null);
    gen = new ReportGenerator(db);
    await expect(gen.generateHTMLReport(99)).rejects.toThrow('Framework not found');
  });

  it('returns a complete HTML document', async () => {
    const html = await gen.generateHTMLReport(1);
    expect(html).toContain('<!DOCTYPE html>');
    expect(html).toContain('<html lang="en">');
    expect(html).toContain('</html>');
    expect(html).toContain('<head>');
    expect(html).toContain('<body>');
  });

  it('includes the framework name in the title', async () => {
    const html = await gen.generateHTMLReport(1);
    expect(html).toContain('SOC 2 Type II');
  });

  it('includes the overall score as a percentage', async () => {
    const html = await gen.generateHTMLReport(1);
    expect(html).toContain('75%');
  });

  it('includes control summary counts', async () => {
    const html = await gen.generateHTMLReport(1);
    expect(html).toContain('54');  // total_controls
    expect(html).toContain('30');  // compliant_controls
    expect(html).toContain('10');  // non_compliant_controls
  });

  it('includes the assessment statement disclaimer', async () => {
    const html = await gen.generateHTMLReport(1);
    expect(html).toContain('readiness self-assessment');
    expect(html).toContain('not a SOC 2 attestation');
  });

  it('renders the report fingerprint', async () => {
    const html = await gen.generateHTMLReport(1);
    expect(html).toContain('Report fingerprint (SHA-256)');
    // Fingerprint should be a hex string
    expect(html).toMatch(/SHA-256.*[a-f0-9]{16}/);
  });

  it('includes per-control detail sections', async () => {
    const html = await gen.generateHTMLReport(1);
    expect(html).toContain('CC1.1');
    expect(html).toContain('CC6.1');
    expect(html).toContain('Control Assessment Detail');
  });

  it('renders evidence gaps for non-compliant controls', async () => {
    const html = await gen.generateHTMLReport(1);
    expect(html).toContain('system_configs');
    expect(html).toContain('security_policies');
  });

  it('renders the remediation roadmap when controls have gaps', async () => {
    const html = await gen.generateHTMLReport(1);
    expect(html).toContain('Remediation Roadmap');
  });

  it('includes Trust Services Criteria category scores', async () => {
    const html = await gen.generateHTMLReport(1);
    expect(html).toContain('Trust Services Criteria');
    expect(html).toContain('Security (Common Criteria)');
    expect(html).toContain('Availability');
  });

  it('includes the report ID with date', async () => {
    const html = await gen.generateHTMLReport(1);
    // Report ID format: CG-SOC2-YYYYMMDD-NNN
    expect(html).toMatch(/CG-SOC2-\d{8}-\d{3}/);
  });

  it('includes the SVG seal/badge', async () => {
    const html = await gen.generateHTMLReport(1);
    expect(html).toContain('READINESS ASSESSMENT');
    expect(html).toContain('<svg');
  });

  it('includes the CG brand mark', async () => {
    const html = await gen.generateHTMLReport(1);
    expect(html).toContain('ComplianceGuard');
    expect(html).toContain('#2563EB'); // brand blue
  });

  it('renders with custom branding config', async () => {
    const html = await gen.generateHTMLReport(1, {
      companyName: 'Acme Corp',
      reportFooter: '© 2025 Acme Corp',
      systemDescription: 'Acme runs on AWS us-east-1.',
    });
    expect(html).toContain('Acme Corp');
    expect(html).toContain('© 2025 Acme Corp');
    expect(html).toContain('System Description');
    expect(html).toContain('Acme runs on AWS us-east-1.');
  });

  it('renders Type II engagement framing when reportType is type_2', async () => {
    const html = await gen.generateHTMLReport(1, {
      reportType: 'type_2',
      periodStart: '2025-01-01',
      periodEnd: '2025-12-31',
    });
    expect(html).toContain('Type II');
    expect(html).toContain('2025-01-01');
    expect(html).toContain('2025-12-31');
    expect(html).toContain('operating effectiveness');
  });

  it('renders Type I engagement framing when reportType is type_1', async () => {
    const html = await gen.generateHTMLReport(1, {
      reportType: 'type_1',
    });
    expect(html).toContain('Type I');
    expect(html).toContain('(design)');
  });

  it('includes evidence count in the executive summary', async () => {
    const html = await gen.generateHTMLReport(1);
    expect(html).toContain('Evidence items collected');
  });

  it('renders status badges with correct CSS classes', async () => {
    const html = await gen.generateHTMLReport(1);
    expect(html).toContain('status compliant');
    expect(html).toContain('status non_compliant');
  });

  it('handles missing evaluation gracefully (empty findings)', async () => {
    const db = makeMockDb({ evaluation: null });
    gen = new ReportGenerator(db);
    const html = await gen.generateHTMLReport(1);
    expect(html).toContain('<!DOCTYPE html>');
    // Score should default to 0
    expect(html).toContain('0%');
  });

  it('handles missing remediation plan gracefully', async () => {
    const db = makeMockDb({ remediationPlan: null });
    gen = new ReportGenerator(db);
    const html = await gen.generateHTMLReport(1);
    expect(html).toContain('<!DOCTYPE html>');
  });

  it('handles getRemediationPlan throwing (enterprise-only)', async () => {
    const db = makeMockDb();
    db.getRemediationPlan = vi.fn(async () => { throw new Error('not implemented'); });
    gen = new ReportGenerator(db);
    const html = await gen.generateHTMLReport(1);
    expect(html).toContain('<!DOCTYPE html>');
  });

  it('renders with a custom logo (PNG base64)', async () => {
    // Minimal 1x1 PNG in base64
    const pngBase64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';
    const html = await gen.generateHTMLReport(1, { logoBase64: pngBase64 });
    expect(html).toContain('data:image/png;base64,');
    expect(html).toContain('img');
  });

  it('falls back to CG mark for invalid logo', async () => {
    const html = await gen.generateHTMLReport(1, { logoBase64: 'not-valid-base64!!!' });
    // Should use the SVG CG mark instead
    expect(html).toContain('<svg');
    expect(html).toContain('CG</text>');
  });

  it('falls back to CG mark for non-image base64', async () => {
    // Valid base64 but decodes to non-image bytes
    const textBase64 = Buffer.from('hello world').toString('base64');
    const html = await gen.generateHTMLReport(1, { logoBase64: textBase64 });
    expect(html).toContain('<svg');
  });

  it('renders the scope grid with assessment metadata', async () => {
    const html = await gen.generateHTMLReport(1);
    expect(html).toContain('Scope of Assessment');
    expect(html).toContain('Entity');
    expect(html).toContain('Framework');
    expect(html).toContain('Controls in scope');
    expect(html).toContain('Overall readiness');
  });

  it('uses default branding when brandingConfig is null', async () => {
    const html = await gen.generateHTMLReport(1, null);
    // Should use default company name
    expect(html).toContain('ComplianceGuard');
  });
});
