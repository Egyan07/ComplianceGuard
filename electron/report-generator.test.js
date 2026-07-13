import { describe, it, expect } from 'vitest';
import {
  buildReportId,
  scoreColor,
  computeReportFingerprint,
  resolveLogoDataUrl,
  cgMarkSvg,
  sealSvg,
  criterionName,
  criteriaInScope,
} from './processing/report-generator.js';
import ReportGenerator from './processing/report-generator.js';

describe('buildReportId', () => {
  it('formats date and zero-pads integer framework id', () => {
    expect(buildReportId(1, new Date('2026-07-10T12:00:00Z'))).toBe('CG-SOC2-20260710-001');
  });
  it('does not truncate ids over 999', () => {
    expect(buildReportId(1234, new Date('2026-07-10T00:00:00Z'))).toBe('CG-SOC2-20260710-1234');
  });
});

describe('scoreColor', () => {
  it('green at >=90, amber at 70-89, red below 70', () => {
    expect(scoreColor(90)).toBe('#66BB6A');
    expect(scoreColor(70)).toBe('#FFA726');
    expect(scoreColor(69)).toBe('#EF5350');
  });
});

describe('computeReportFingerprint', () => {
  it('is deterministic for the same findings', () => {
    const f = { overall_score: 82, status: 'partial' };
    expect(computeReportFingerprint(f)).toBe(computeReportFingerprint({ status: 'partial', overall_score: 82 }));
  });
  it('changes when findings change', () => {
    expect(computeReportFingerprint({ overall_score: 82 })).not.toBe(computeReportFingerprint({ overall_score: 83 }));
  });
  it('returns null for empty or missing findings', () => {
    expect(computeReportFingerprint(null)).toBeNull();
    expect(computeReportFingerprint({})).toBeNull();
  });
});

describe('resolveLogoDataUrl', () => {
  it('builds a png data url from valid base64 with PNG magic bytes', () => {
    const png = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00]).toString('base64');
    expect(resolveLogoDataUrl(png)).toBe(`data:image/png;base64,${png}`);
  });
  it('builds a jpeg data url from valid base64 with JPEG magic bytes', () => {
    const jpg = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00]).toString('base64');
    expect(resolveLogoDataUrl(jpg)).toBe(`data:image/jpeg;base64,${jpg}`);
  });
  it('returns null for unrecognized bytes, bad charset, or empty', () => {
    const gif = Buffer.from([0x47, 0x49, 0x46, 0x38]).toString('base64');
    expect(resolveLogoDataUrl(gif)).toBeNull();
    expect(resolveLogoDataUrl('not*valid*base64')).toBeNull();
    expect(resolveLogoDataUrl(null)).toBeNull();
  });
});

describe('svg marks', () => {
  it('cgMarkSvg embeds the CG wordmark at the requested size', () => {
    const svg = cgMarkSvg(48);
    expect(svg).toContain('<svg');
    expect(svg).toContain('width="48"');
    expect(svg).toContain('>CG<');
  });
  it('sealSvg contains the readiness wording and no verified/certified claim', () => {
    const svg = sealSvg('July 10, 2026');
    expect(svg).toContain('READINESS ASSESSMENT');
    expect(svg).toContain('July 10, 2026');
    expect(svg).not.toMatch(/verified|certified/i);
  });
});

function makeGen(findings, { evidence = [], framework = { name: 'SOC 2', version: '2017' } } = {}) {
  const db = {
    getFrameworkById: async () => framework,
    getLatestEvaluation: async () => (findings === undefined ? null : { findings, overall_score: findings?.overall_score, status: findings?.status }),
    getEvidenceByFramework: async () => evidence,
  };
  return new ReportGenerator(db);
}

describe('generateHTMLReport', () => {
  it('renders the readiness title, seal wording, and disclaimer, with no attestation claim', async () => {
    const html = await makeGen({ overall_score: 82, status: 'partial', total_controls: 10 }).generateHTMLReport(1);
    expect(html).toContain('SOC 2 Readiness Assessment');
    expect(html).toContain('READINESS ASSESSMENT');
    expect(html.replace(/\s+/g, ' ')).toContain('is not a SOC 2 attestation issued by a licensed CPA firm');
    expect(html).not.toMatch(/\bVerified\b|\bCertified\b/);
  });

  it('shows the report id and a report fingerprint when findings exist', async () => {
    const html = await makeGen({ overall_score: 82, status: 'partial' }).generateHTMLReport(1);
    expect(html).toMatch(/CG-SOC2-\d{8}-001/);
    expect(html).toMatch(/Report fingerprint \(SHA-256\)/);
  });

  it('uses a valid Enterprise logo in place of the CG mark', async () => {
    const png = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00]).toString('base64');
    const html = await makeGen({ overall_score: 90 }).generateHTMLReport(1, { companyName: 'Acme', logoBase64: png });
    expect(html).toContain(`data:image/png;base64,${png}`);
    expect(html).toContain('Acme');
  });

  it('falls back to the CG mark for an invalid logo and does not emit a raw data url', async () => {
    const html = await makeGen({ overall_score: 90 }).generateHTMLReport(1, { companyName: 'Acme', logoBase64: 'bad*data' });
    expect(html).not.toContain('data:image');
    expect(html).toContain('>CG<');
  });

  it('does not crash and omits the fingerprint when there is no evaluation', async () => {
    const html = await makeGen(undefined).generateHTMLReport(1);
    expect(html).toContain('SOC 2 Readiness Assessment');
    expect(html).not.toMatch(/Report fingerprint \(SHA-256\)/);
  });

  it('uses the Apple system font stack and print-break rules', async () => {
    const html = await makeGen({ overall_score: 50 }).generateHTMLReport(1);
    expect(html).toContain('-apple-system');
    expect(html).toContain('page-break-inside:avoid');
  });

  it('escapes HTML in string fields (no raw markup injection)', async () => {
    const findings = {
      overall_score: 80,
      control_results: { 'CC1.1': { control_title: '<script>alert(1)</script>', status: 'partial', score: 50, evidence_count: 1, gaps: [] } },
    };
    const html = await makeGen(findings).generateHTMLReport(1);
    expect(html).not.toContain('<script>alert(1)</script>');
    expect(html).toContain('&lt;script&gt;');
  });

  it('coerces non-numeric numeric fields to 0 without emitting raw HTML', async () => {
    const findings = { overall_score: 80, total_controls: '<b>x</b>' };
    const html = await makeGen(findings).generateHTMLReport(1);
    expect(html).not.toContain('<b>x</b>');
  });

  it('renders a System Description section only when provided, and escapes it', async () => {
    const withDesc = await makeGen({ overall_score: 80 }).generateHTMLReport(1, { companyName: 'Acme', systemDescription: 'Acme runs a multi-tenant SaaS on AWS. <b>x</b>' });
    expect(withDesc).toContain('System Description');
    expect(withDesc).toContain('multi-tenant SaaS on AWS');
    expect(withDesc).not.toContain('<b>x</b>');
    const without = await makeGen({ overall_score: 80 }).generateHTMLReport(1);
    expect(without).not.toContain('System Description');
  });
});

describe('criterionName / criteriaInScope', () => {
  it('maps known SOC 2 TSC codes and falls back to the raw code', () => {
    expect(criterionName('CC')).toBe('Security (Common Criteria)');
    expect(criterionName('A')).toBe('Availability');
    expect(criterionName('PI')).toBe('Processing Integrity');
    expect(criterionName('ZZ')).toBe('ZZ');
    expect(criterionName(null)).toBe('');
  });
  it('derives in-scope criteria from category_scores keys', () => {
    expect(criteriaInScope({ category_scores: { CC: {}, A: {} } })).toEqual(['CC', 'A']);
  });
  it('falls back to distinct control_result categories', () => {
    const findings = { control_results: { 'CC1.1': { control_category: 'CC' }, 'A1.2': { control_category: 'A' }, 'CC6.1': { control_category: 'CC' } } };
    expect(criteriaInScope(findings)).toEqual(['CC', 'A']);
  });
  it('returns empty when nothing to derive from', () => {
    expect(criteriaInScope({})).toEqual([]);
  });
});

describe('generateHTMLReport — framework-driven title & TSC mapping', () => {
  function gen(findings, frameworkName) {
    const db = {
      getFrameworkById: async () => ({ name: frameworkName, version: '2022' }),
      getLatestEvaluation: async () => ({ findings, overall_score: findings.overall_score, status: findings.status }),
      getEvidenceByFramework: async () => [],
    };
    return new ReportGenerator(db);
  }
  it('titles the report from the framework, not hardcoded SOC 2', async () => {
    const html = await gen({ overall_score: 70 }, 'ISO 27001').generateHTMLReport(1);
    expect(html).toContain('ISO 27001 Readiness Assessment');
    expect(html).not.toContain('SOC 2 Readiness Assessment');
  });
  it('renders friendly Trust Services Criteria names for SOC 2', async () => {
    const html = await gen({ overall_score: 88, category_scores: { CC: { score: 90, control_count: 5 }, A: { score: 80, control_count: 3 } } }, 'SOC 2').generateHTMLReport(1);
    expect(html).toContain('Trust Services Criteria');
    expect(html).toContain('Security (Common Criteria)');
    expect(html).toContain('Availability');
  });
  it('uses generic "Control Domains" wording for non-SOC frameworks', async () => {
    const html = await gen({ overall_score: 60, category_scores: { 'A.5': { score: 60, control_count: 4 } } }, 'ISO 27001').generateHTMLReport(1);
    expect(html).toContain('Control Domains');
    expect(html).not.toContain('Trust Services Criteria');
  });
});

describe('generateHTMLReport — remediation owners & roadmap', () => {
  function genWithPlan(findings, plan) {
    const db = {
      getFrameworkById: async () => ({ name: 'SOC 2', version: '2017' }),
      getLatestEvaluation: async () => ({ findings, overall_score: findings.overall_score, status: findings.status }),
      getEvidenceByFramework: async () => [],
      getRemediationPlan: async () => plan,
    };
    return new ReportGenerator(db);
  }
  const findings = {
    overall_score: 60,
    control_results: {
      'CC6.1': { control_title: 'Access Controls', control_category: 'CC', status: 'partial', score: 60, evidence_count: 1, evidence_details: [], gaps: ['mfa_log'] },
      'A1.2': { control_title: 'Recovery', control_category: 'A', status: 'non_compliant', score: 20, evidence_count: 0, evidence_details: [], gaps: ['dr_test'] },
    },
  };
  it('renders owner and target date per control and a Remediation Roadmap', async () => {
    const plan = { 'CC6.1': { owner: 'Jane Smith', target_date: '2026-09-30', notes: 'ticket JIRA-42' } };
    const html = await genWithPlan(findings, plan).generateHTMLReport(1);
    expect(html).toContain('Remediation Roadmap');
    expect(html).toContain('Jane Smith');
    expect(html).toContain('2026-09-30');
    expect(html).toContain('ticket JIRA-42');
  });
  it('omits the roadmap when no controls have gaps or plan entries', async () => {
    const clean = { overall_score: 100, control_results: { 'CC1.1': { control_title: 'X', status: 'compliant', score: 100, evidence_count: 2, evidence_details: [], gaps: [] } } };
    const html = await genWithPlan(clean, {}).generateHTMLReport(1);
    expect(html).not.toContain('Remediation Roadmap');
  });
});
