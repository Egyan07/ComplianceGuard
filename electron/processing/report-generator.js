const log = require('../logger');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { canonicalJson } = require('./audit-service');

/**
 * Generates compliance reports in multiple formats.
 * PDF generation uses a structured text format that can be
 * saved and printed. For proper PDF with styling, we generate
 * an HTML report that Electron can print to PDF.
 */

function escapeHtml(value) {
  if (value === null || value === undefined) return '';
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function buildReportId(frameworkId, date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  const n = Number.parseInt(frameworkId, 10);
  const safe = Number.isFinite(n) ? n : 0;
  const idPart = safe <= 999 ? String(safe).padStart(3, '0') : String(safe);
  return `CG-SOC2-${y}${m}${d}-${idPart}`;
}

function scoreColor(score) {
  return score >= 90 ? '#66BB6A' : score >= 70 ? '#FFA726' : '#EF5350';
}

function numOr0(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

function computeReportFingerprint(findings) {
  if (!findings || typeof findings !== 'object' || Object.keys(findings).length === 0) {
    return null;
  }
  return crypto.createHash('sha256').update(canonicalJson(findings), 'utf8').digest('hex');
}

function resolveLogoDataUrl(logoBase64) {
  if (!logoBase64 || typeof logoBase64 !== 'string') return null;
  if (!/^[A-Za-z0-9+/]+={0,2}$/.test(logoBase64)) return null;
  let raw;
  try {
    raw = Buffer.from(logoBase64, 'base64');
  } catch {
    return null;
  }
  let mime = null;
  if (raw.length >= 8 && raw[0] === 0x89 && raw[1] === 0x50 && raw[2] === 0x4e && raw[3] === 0x47) {
    mime = 'image/png';
  } else if (raw.length >= 2 && raw[0] === 0xff && raw[1] === 0xd8) {
    mime = 'image/jpeg';
  }
  if (!mime) return null;
  return `data:${mime};base64,${logoBase64}`;
}

// ComplianceGuard mark: blue rounded square + white "CG" (source: resources/icons/icon.svg)
function cgMarkSvg(sizePx) {
  return `<svg viewBox="0 0 512 512" width="${sizePx}" height="${sizePx}" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="ComplianceGuard">
  <rect width="512" height="512" rx="112" fill="#2563EB"/>
  <text x="256" y="256" dy="0.35em" font-family="Arial,'Helvetica Neue',Helvetica,sans-serif" font-size="200" font-weight="700" fill="#FFFFFF" text-anchor="middle" letter-spacing="-10">CG</text>
</svg>`;
}

// Circular readiness-assessment seal (gold rings + curved wording + CG mark + date).
function sealSvg(dateText) {
  return `<svg viewBox="0 0 200 200" width="150" height="150" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="ComplianceGuard Readiness Assessment">
  <defs>
    <path id="cg-seal-arc" d="M 100,100 m -74,0 a 74,74 0 1,1 148,0 a 74,74 0 1,1 -148,0"/>
  </defs>
  <circle cx="100" cy="100" r="94" fill="none" stroke="#C9A227" stroke-width="2"/>
  <circle cx="100" cy="100" r="86" fill="none" stroke="#C9A227" stroke-width="1"/>
  <text fill="#C9A227" font-size="12" font-weight="600" letter-spacing="3" font-family="Georgia,'Times New Roman',serif">
    <textPath href="#cg-seal-arc" startOffset="0">COMPLIANCEGUARD · READINESS ASSESSMENT · </textPath>
  </text>
  <g transform="translate(66,58) scale(0.132)">
    <rect width="512" height="512" rx="112" fill="#2563EB"/>
    <text x="256" y="256" dy="0.35em" font-family="Arial,'Helvetica Neue',Helvetica,sans-serif" font-size="200" font-weight="700" fill="#FFFFFF" text-anchor="middle" letter-spacing="-10">CG</text>
  </g>
  <text x="100" y="150" text-anchor="middle" font-size="10" fill="#C9A227" font-family="Georgia,'Times New Roman',serif" letter-spacing="1">${escapeHtml(dateText)}</text>
</svg>`;
}

class ReportGenerator {
  constructor(database) {
    this.db = database;
  }

  /**
   * Generate a full HTML compliance report that Electron can print to PDF.
   */
  async generateHTMLReport(frameworkId, brandingConfig = null) {
    const framework = await this.db.getFrameworkById(frameworkId);
    if (!framework) throw new Error('Framework not found');

    const evaluation = await this.db.getLatestEvaluation(frameworkId);
    const evidence = await this.db.getEvidenceByFramework(frameworkId);
    const findings = evaluation?.findings || {};

    const now = new Date();
    const dateText = now.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
    const overallScore = findings.overall_score || evaluation?.overall_score || 0;
    const status = findings.status || evaluation?.status || 'not_assessed';

    const companyName = brandingConfig?.companyName || 'ComplianceGuard';
    const reportFooter = brandingConfig?.reportFooter || null;
    const logoDataUrl = resolveLogoDataUrl(brandingConfig?.logoBase64 || null);
    const brandMark = logoDataUrl
      ? `<img src="${logoDataUrl}" alt="${escapeHtml(companyName)}" style="height:56px;width:auto;border-radius:8px"/>`
      : cgMarkSvg(56);
    const reportId = buildReportId(frameworkId, now);
    const fingerprint = computeReportFingerprint(evaluation?.findings || null);
    const shortFp = fingerprint ? fingerprint.slice(0, 16) : null;
    const frameworkVersion = escapeHtml(framework.version || '2017');

    const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<title>${escapeHtml(companyName)} — SOC 2 Readiness Assessment</title>
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  :root {
    --ink: #1a1a2e; --navy: #0D2540; --blue: #0D47A1; --accent: #1565C0;
    --gold: #C9A227; --line: #E0E0E0; --serif: Georgia, 'Times New Roman', serif;
    --sans: 'Segoe UI', 'Helvetica Neue', Arial, sans-serif;
  }
  body { font-family: var(--sans); color: var(--ink); line-height: 1.6; }

  /* Cover (full-bleed; printToPDF margins are 0) */
  .cover {
    page-break-after: always; min-height: 100vh;
    display: flex; flex-direction: column; align-items: center; justify-content: center;
    background: linear-gradient(135deg, #0D1B2A 0%, #123049 45%, #0A2540 100%);
    color: #fff; text-align: center; padding: 64px 60px;
  }
  .cover .brand { margin-bottom: 28px; }
  .cover .kicker { font-family: var(--serif); font-size: 15px; letter-spacing: 4px; text-transform: uppercase; color: #90CAF9; margin-bottom: 10px; }
  .cover h1 { font-family: var(--serif); font-size: 44px; font-weight: 700; letter-spacing: -0.5px; margin-bottom: 10px; }
  .cover .company { font-size: 18px; color: #CFD8DC; margin-bottom: 4px; }
  .cover .framework { font-size: 14px; color: #90A4AE; letter-spacing: 1px; text-transform: uppercase; }
  .cover .seal { margin: 34px 0; }
  .cover .score-panel {
    margin-top: 8px; padding: 20px 44px; border-radius: 12px;
    background: rgba(255,255,255,0.08); border: 1px solid rgba(255,255,255,0.18);
  }
  .cover .score-value { font-size: 60px; font-weight: 700; color: ${scoreColor(overallScore)}; }
  .cover .score-label { font-size: 13px; color: #B0BEC5; text-transform: uppercase; letter-spacing: 2px; }
  .cover .meta { margin-top: 30px; font-size: 12px; color: #90A4AE; letter-spacing: 1px; }

  /* Statement page */
  .statement { page-break-after: always; padding: 0.7in 0.75in; }
  .statement .head { display: flex; align-items: center; justify-content: space-between; border-bottom: 2px solid var(--line); padding-bottom: 16px; margin-bottom: 24px; }
  .statement h2, .content h2 { font-family: var(--serif); font-size: 24px; font-weight: 700; color: var(--navy); }
  .statement p { margin: 12px 0; }
  .statement .disclaimer { font-style: italic; color: #555; background: #FBFBF6; border-left: 3px solid var(--gold); padding: 12px 16px; margin: 20px 0; }
  .statement .integrity { font-family: var(--sans); font-size: 12px; color: #666; margin-top: 18px; word-break: break-all; }
  .statement .integrity code { font-family: 'Courier New', monospace; color: var(--navy); }

  /* Content pages */
  .content { padding: 0.6in 0.6in; }
  .content h2 { border-bottom: 2px solid #E3F2FD; padding-bottom: 8px; margin: 28px 0 16px; break-after: avoid; }
  .content h3 { font-family: var(--serif); font-size: 16px; color: var(--accent); margin: 20px 0 10px; break-after: avoid; }

  .summary-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 16px; margin: 16px 0 24px; }
  .summary-card { background: #F5F7FA; border-radius: 8px; padding: 16px; text-align: center; border-left: 4px solid var(--accent); page-break-inside: avoid; }
  .summary-card.compliant { border-left-color: #66BB6A; }
  .summary-card.partial { border-left-color: #FFA726; }
  .summary-card.non-compliant { border-left-color: #EF5350; }
  .summary-card .value { font-size: 30px; font-weight: 700; }
  .summary-card .label { font-size: 12px; color: #666; text-transform: uppercase; letter-spacing: 1px; }

  table { width: 100%; border-collapse: collapse; margin: 12px 0 24px; font-size: 13px; }
  thead { display: table-header-group; }
  th { background: var(--blue); color: #fff; padding: 10px 12px; text-align: left; font-weight: 500; }
  td { padding: 8px 12px; border-bottom: 1px solid var(--line); }
  tr { page-break-inside: avoid; }
  tr:nth-child(even) { background: #FAFAFA; }

  .status { display: inline-block; padding: 2px 10px; border-radius: 12px; font-size: 11px; font-weight: 600; text-transform: uppercase; }
  .status.compliant { background: #E8F5E9; color: #2E7D32; }
  .status.partial { background: #FFF3E0; color: #E65100; }
  .status.non_compliant, .status.non-compliant { background: #FFEBEE; color: #C62828; }
  .status.not_assessed, .status.not-assessed { background: #F5F5F5; color: #757575; }

  .score-bar { display: flex; align-items: center; gap: 8px; }
  .score-bar-bg { flex: 1; height: 8px; background: #E0E0E0; border-radius: 4px; overflow: hidden; }
  .score-bar-fill { height: 100%; border-radius: 4px; }

  .recommendation { background: #FFF8E1; border-left: 4px solid #FFA726; padding: 12px 16px; margin: 8px 0; border-radius: 0 4px 4px 0; page-break-inside: avoid; }
  .recommendation.high { background: #FFEBEE; border-left-color: #EF5350; }
  .recommendation .priority { font-size: 11px; font-weight: 600; text-transform: uppercase; letter-spacing: 1px; margin-bottom: 4px; color: #E65100; }
  .recommendation.high .priority { color: #C62828; }

  .footer { margin-top: 40px; padding-top: 16px; border-top: 1px solid var(--line); font-size: 11px; color: #999; text-align: center; }
  .footer .rid { color: #666; }

  @media print { body { -webkit-print-color-adjust: exact; print-color-adjust: exact; } }
</style>
</head>
<body>

<div class="cover">
  <div class="brand">${brandMark}</div>
  <div class="kicker">${escapeHtml(companyName)}</div>
  <h1>SOC 2 Readiness Assessment</h1>
  <div class="company">${escapeHtml(framework.name)} Framework · v${frameworkVersion}</div>
  <div class="seal">${sealSvg(dateText)}</div>
  <div class="score-panel">
    <div class="score-value">${Math.round(overallScore)}%</div>
    <div class="score-label">Overall Readiness Score</div>
  </div>
  <div class="meta">${escapeHtml(reportId)} &nbsp;·&nbsp; Generated on ${escapeHtml(dateText)}${shortFp ? ` &nbsp;·&nbsp; ${escapeHtml(shortFp)}…` : ''}</div>
</div>

<div class="statement">
  <div class="head">
    ${brandMark}
    <div style="text-align:right;font-size:12px;color:#666">${escapeHtml(reportId)}<br>${escapeHtml(dateText)}</div>
  </div>
  <h2>Assessment Statement</h2>
  <p>This document presents a readiness self-assessment of <strong>${escapeHtml(companyName)}</strong> against the
  <strong>${escapeHtml(framework.name)}</strong> framework (v${frameworkVersion}), covering
  <strong>${numOr0(findings.total_controls)} controls</strong>. It was generated by ComplianceGuard on ${escapeHtml(dateText)}.</p>
  <p><strong>Methodology.</strong> ComplianceGuard automatically collects evidence from connected sources and evaluates
  it against each control. The overall readiness score reflects the proportion of controls with sufficient supporting
  evidence. A total of <strong>${evidence.length} evidence item(s)</strong> were considered.</p>
  <div class="disclaimer">This is a readiness self-assessment generated by ComplianceGuard and is not a SOC 2 attestation issued by a licensed CPA firm.</div>
  ${shortFp ? `<div class="integrity"><strong>Report fingerprint (SHA-256):</strong> <code>${escapeHtml(fingerprint)}</code><br>This fingerprint uniquely identifies this report's evaluation data; any change to the underlying results alters it.</div>` : ''}
</div>

<div class="content">
  <h2>Executive Summary</h2>
  <div class="summary-grid">
    <div class="summary-card total"><div class="value">${numOr0(findings.total_controls)}</div><div class="label">Total Controls</div></div>
    <div class="summary-card compliant"><div class="value" style="color:#2E7D32">${numOr0(findings.compliant_controls)}</div><div class="label">Compliant</div></div>
    <div class="summary-card partial"><div class="value" style="color:#E65100">${numOr0(findings.partial_controls)}</div><div class="label">Partial</div></div>
    <div class="summary-card non-compliant"><div class="value" style="color:#C62828">${numOr0(findings.non_compliant_controls)}</div><div class="label">Non-Compliant</div></div>
  </div>

  <p>The evaluation covers <strong>${numOr0(findings.total_controls)} controls</strong> across the
  ${escapeHtml(framework.name)} framework. The overall readiness score is
  <strong>${Math.round(overallScore)}%</strong> with a status of
  <span class="status ${escapeHtml(status)}">${escapeHtml(status).replace(/_/g, ' ')}</span>.</p>
  <p><strong>Evidence items collected:</strong> ${evidence.length}</p>

  ${findings.category_scores ? `
  <h2>Category Scores</h2>
  <table>
    <thead><tr><th>Category</th><th>Score</th><th>Controls</th><th>Visual</th></tr></thead>
    <tbody>
      ${Object.entries(findings.category_scores).map(([cat, data]) => {
        const score = Math.round(data.score || 0);
        const color = scoreColor(score);
        return `<tr>
          <td><strong>${escapeHtml(cat)}</strong></td>
          <td>${score}%</td>
          <td>${numOr0(data.control_count)}</td>
          <td><div class="score-bar"><div class="score-bar-bg"><div class="score-bar-fill" style="width:${score}%;background:${color}"></div></div></div></td>
        </tr>`;
      }).join('')}
    </tbody>
  </table>` : ''}

  ${findings.control_results ? `
  <h2>Control Assessment Details</h2>
  <table>
    <thead><tr><th>Control ID</th><th>Title</th><th>Score</th><th>Status</th><th>Evidence</th><th>Gaps</th></tr></thead>
    <tbody>
      ${Object.entries(findings.control_results).map(([id, ctrl]) => `<tr>
        <td><strong>${escapeHtml(id)}</strong></td>
        <td>${escapeHtml(ctrl.control_title || '')}</td>
        <td>${numOr0(ctrl.score)}%</td>
        <td><span class="status ${escapeHtml(ctrl.status)}">${escapeHtml(ctrl.status || '').replace(/_/g, ' ')}</span></td>
        <td>${numOr0(ctrl.evidence_count)}</td>
        <td>${(ctrl.gaps || []).length}</td>
      </tr>`).join('')}
    </tbody>
  </table>` : ''}

  ${findings.recommendations && findings.recommendations.length > 0 ? `
  <h2>Recommendations</h2>
  ${findings.recommendations.map(rec => `
    <div class="recommendation ${escapeHtml(rec.priority || 'medium')}">
      <div class="priority">${escapeHtml(rec.priority || 'medium')} priority — ${escapeHtml(rec.control_id)}</div>
      <div>${escapeHtml(rec.recommendation)}</div>
      ${rec.evidence_needed && rec.evidence_needed.length > 0 ? `<div style="margin-top:6px;font-size:12px;color:#666"><strong>Evidence needed:</strong> ${rec.evidence_needed.map(e => escapeHtml(e)).join(', ')}</div>` : ''}
    </div>`).join('')}` : ''}

  <h2>Evidence Summary</h2>
  <table>
    <thead><tr><th>#</th><th>Title</th><th>Type</th><th>Control</th><th>Collected</th></tr></thead>
    <tbody>
      ${evidence.slice(0, 50).map((item, i) => `<tr>
        <td>${i + 1}</td>
        <td>${escapeHtml(item.title)}</td>
        <td>${escapeHtml(item.evidence_type || '').replace(/_/g, ' ')}</td>
        <td>${escapeHtml(item.control_id)}</td>
        <td>${item.collected_at ? new Date(item.collected_at).toLocaleDateString() : 'N/A'}</td>
      </tr>`).join('')}
      ${evidence.length > 50 ? `<tr><td colspan="5" style="text-align:center;color:#999">… and ${evidence.length - 50} more items</td></tr>` : ''}
    </tbody>
  </table>

  <div class="footer">
    ${escapeHtml(companyName)} — Collect. Evaluate. Comply.<br>
    <span class="rid">${escapeHtml(reportId)}${shortFp ? ` · ${escapeHtml(shortFp)}…` : ''} · Framework: ${escapeHtml(framework.name)} v${frameworkVersion}</span><br>
    Confidential — prepared for internal use.
    ${reportFooter ? `<br>${escapeHtml(reportFooter)}` : ''}
  </div>
</div>

</body>
</html>`;

    return html;
  }
}

module.exports = ReportGenerator;
module.exports.ReportGenerator = ReportGenerator;
module.exports.buildReportId = buildReportId;
module.exports.scoreColor = scoreColor;
module.exports.computeReportFingerprint = computeReportFingerprint;
module.exports.resolveLogoDataUrl = resolveLogoDataUrl;
module.exports.cgMarkSvg = cgMarkSvg;
module.exports.sealSvg = sealSvg;
