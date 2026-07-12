import { describe, it, expect } from 'vitest';
import {
  buildReportId,
  scoreColor,
  computeReportFingerprint,
  resolveLogoDataUrl,
  cgMarkSvg,
  sealSvg,
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

  it('uses the serif heading stack and print-break rules', async () => {
    const html = await makeGen({ overall_score: 50 }).generateHTMLReport(1);
    expect(html).toContain("Georgia, 'Times New Roman', serif");
    expect(html).toContain('page-break-inside: avoid');
  });
});
