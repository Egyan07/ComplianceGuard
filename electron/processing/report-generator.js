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

// SOC 2 Trust Services Criteria code → friendly name. Unknown codes fall back to the raw code.
const TSC_NAMES = {
  CC: 'Security (Common Criteria)',
  A: 'Availability',
  C: 'Confidentiality',
  PI: 'Processing Integrity',
  P: 'Privacy',
  CA: 'Confidentiality & Availability',
};
function criterionName(code) {
  return TSC_NAMES[code] || String(code == null ? '' : code);
}

// Derive the criteria/domains actually present in the evaluation (no hardcoded scope).
function criteriaInScope(findings) {
  if (findings && findings.category_scores && typeof findings.category_scores === 'object') {
    return Object.keys(findings.category_scores);
  }
  if (findings && findings.control_results && typeof findings.control_results === 'object') {
    const seen = [];
    Object.values(findings.control_results).forEach((c) => {
      if (c && c.control_category && !seen.includes(c.control_category)) seen.push(c.control_category);
    });
    return seen;
  }
  return [];
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

// Minimal readiness-assessment badge (hairline rings + curved wording + CG mark + date), Apple-style.
function sealSvg(dateText) {
  const sys = "-apple-system,BlinkMacSystemFont,'SF Pro Text','Helvetica Neue','Segoe UI',Helvetica,Arial,sans-serif";
  return `<svg viewBox="0 0 200 188" width="150" height="141" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="ComplianceGuard Readiness Assessment">
  <circle cx="100" cy="62" r="52" fill="#FFFFFF" stroke="#D2D2D7" stroke-width="1"/>
  <circle cx="100" cy="62" r="44" fill="none" stroke="#E8E8ED" stroke-width="1"/>
  <g transform="translate(78,40) scale(0.086)">
    <rect width="512" height="512" rx="112" fill="#2563EB"/>
    <text x="256" y="256" dy="0.35em" font-family="Arial,'Helvetica Neue',Helvetica,sans-serif" font-size="200" font-weight="700" fill="#FFFFFF" text-anchor="middle" letter-spacing="-10">CG</text>
  </g>
  <circle cx="130" cy="90" r="14" fill="#2563EB" stroke="#FFFFFF" stroke-width="2.5"/>
  <path d="M124,90 l4,4 l8,-8.5" fill="none" stroke="#FFFFFF" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/>
  <text x="100" y="148" text-anchor="middle" font-size="11" font-weight="600" letter-spacing="2" fill="#6E6E73" font-family="${sys}">READINESS ASSESSMENT</text>
  <text x="100" y="166" text-anchor="middle" font-size="9" fill="#86868B" letter-spacing="1" font-family="${sys}">${escapeHtml(dateText)}</text>
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
    const systemDescription = brandingConfig?.systemDescription || null;
    const logoDataUrl = resolveLogoDataUrl(brandingConfig?.logoBase64 || null);
    const brandMark = logoDataUrl
      ? `<img src="${logoDataUrl}" alt="${escapeHtml(companyName)}" style="height:56px;width:auto;border-radius:8px"/>`
      : cgMarkSvg(56);
    const reportId = buildReportId(frameworkId, now);
    const fingerprint = computeReportFingerprint(evaluation?.findings || null);
    const shortFp = fingerprint ? fingerprint.slice(0, 16) : null;
    const frameworkVersion = escapeHtml(framework.version || '2017');
    const recByControl = {};
    (findings.recommendations || []).forEach(r => { if (r && r.control_id) recByControl[r.control_id] = r; });
    const isSoc2 = /soc\s*2/i.test(framework.name || '');
    const reportTitle = `${framework.name || 'Compliance'} Readiness Assessment`;
    const criteriaLabel = isSoc2 ? 'Trust Services Criteria' : 'Control Domains';
    const scopeCriteria = criteriaInScope(findings);

    const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<title>${escapeHtml(companyName)} — ${escapeHtml(reportTitle)}</title>
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  @page { size: 8.5in 11in; margin: 0; }
  :root {
    --ink:#1D1D1F; --sub:#424245; --muted:#6E6E73; --faint:#86868B;
    --line:#D2D2D7; --hair:#E8E8ED; --surface:#F5F5F7; --card:#FFFFFF;
    --accent:#2563EB;
    --sys:-apple-system,BlinkMacSystemFont,'SF Pro Text','SF Pro Display','Helvetica Neue','Segoe UI',Helvetica,Arial,sans-serif;
  }
  html, body { background:#fff; }
  body { font-family:var(--sys); color:var(--ink); line-height:1.55; font-size:14px; -webkit-font-smoothing:antialiased; }

  /* Cover — light & spacious (full-bleed; printToPDF margins are 0) */
  .cover {
    page-break-after:always; min-height:10.9in;
    display:flex; flex-direction:column; align-items:center; justify-content:center;
    background:linear-gradient(180deg,#FFFFFF 0%,#F5F5F7 100%);
    text-align:center; padding:96px 64px;
  }
  .cover .brand { margin-bottom:30px; filter:drop-shadow(0 8px 20px rgba(37,99,235,.20)); }
  .cover .kicker { font-size:12px; font-weight:600; letter-spacing:3px; text-transform:uppercase; color:var(--muted); margin-bottom:18px; }
  .cover h1 { font-size:52px; font-weight:600; letter-spacing:-1.6px; color:var(--ink); margin-bottom:12px; }
  .cover .company { font-size:17px; color:var(--muted); font-weight:400; }
  .cover .seal { margin:40px 0 36px; }
  .cover .score-panel {
    display:inline-flex; flex-direction:column; align-items:center;
    padding:26px 54px; border-radius:22px; background:var(--card);
    border:1px solid var(--hair); box-shadow:0 1px 2px rgba(0,0,0,.04),0 14px 34px rgba(0,0,0,.07);
  }
  .cover .score-value { font-size:66px; font-weight:600; letter-spacing:-2px; line-height:1; color:${scoreColor(overallScore)}; }
  .cover .score-label { margin-top:8px; font-size:12px; color:var(--muted); text-transform:uppercase; letter-spacing:1.6px; }
  .cover .meta { margin-top:42px; font-size:11.5px; color:var(--faint); letter-spacing:.3px; }

  /* Statement page */
  .statement { page-break-after:always; padding:0.85in 0.8in; }
  .statement .head { display:flex; align-items:center; justify-content:space-between; border-bottom:1px solid var(--line); padding-bottom:18px; margin-bottom:30px; }
  .statement .head .rid { text-align:right; font-size:11px; color:var(--muted); line-height:1.5; }
  h2 { font-size:22px; font-weight:600; letter-spacing:-.5px; color:var(--ink); }
  .statement p { margin:14px 0; color:var(--sub); font-size:14.5px; }
  .statement .disclaimer { color:var(--sub); background:var(--surface); border:1px solid var(--hair); border-radius:14px; padding:16px 18px; margin:24px 0; font-size:13.5px; }
  .statement .integrity { font-size:12px; color:var(--muted); margin-top:22px; word-break:break-all; }
  .statement .integrity code { font-family:'SF Mono','SFMono-Regular',Menlo,Consolas,monospace; color:var(--ink); background:var(--surface); padding:2px 6px; border-radius:6px; }

  /* Content pages */
  .content { padding:0.7in 0.7in; }
  .content h2 { margin:36px 0 18px; padding-bottom:10px; border-bottom:1px solid var(--line); break-after:avoid; }
  .content h2:first-child { margin-top:0; }
  .content p { color:var(--sub); }

  .summary-grid { display:grid; grid-template-columns:repeat(4,1fr); gap:14px; margin:18px 0 28px; }
  .summary-card { background:var(--card); border:1px solid var(--hair); border-radius:16px; padding:18px 16px; text-align:center; box-shadow:0 1px 2px rgba(0,0,0,.04),0 6px 16px rgba(0,0,0,.04); page-break-inside:avoid; }
  .summary-card .dot { display:inline-block; width:7px; height:7px; border-radius:50%; margin-bottom:10px; background:var(--faint); }
  .summary-card.total .dot { background:var(--accent); }
  .summary-card.compliant .dot { background:#34C759; }
  .summary-card.partial .dot { background:#FF9500; }
  .summary-card.non-compliant .dot { background:#FF3B30; }
  .summary-card .value { font-size:30px; font-weight:600; letter-spacing:-1px; color:var(--ink); }
  .summary-card .label { margin-top:4px; font-size:11px; color:var(--muted); text-transform:uppercase; letter-spacing:.6px; }

  table { width:100%; border-collapse:collapse; margin:14px 0 26px; font-size:13px; }
  thead { display:table-header-group; }
  th { text-align:left; font-weight:600; font-size:11px; text-transform:uppercase; letter-spacing:.6px; color:var(--muted); padding:0 14px 10px; border-bottom:1px solid var(--line); }
  td { padding:11px 14px; border-bottom:1px solid var(--hair); color:var(--sub); }
  tr { page-break-inside:avoid; }
  td strong { color:var(--ink); font-weight:600; }

  .status { display:inline-block; padding:3px 11px; border-radius:980px; font-size:11px; font-weight:600; }
  .status.compliant { background:rgba(52,199,89,.12); color:#248A3D; }
  .status.partial { background:rgba(255,149,0,.14); color:#B25000; }
  .status.non_compliant, .status.non-compliant { background:rgba(255,59,48,.12); color:#C4231A; }
  .status.not_assessed, .status.not-assessed { background:var(--surface); color:var(--muted); }

  .score-bar { display:flex; align-items:center; gap:8px; }
  .score-bar-bg { flex:1; height:6px; background:var(--hair); border-radius:980px; overflow:hidden; }
  .score-bar-fill { height:100%; border-radius:980px; }

  /* Scope block */
  .scope-grid { display:grid; grid-template-columns:1fr 1fr; gap:0; margin:18px 0 6px; border:1px solid var(--hair); border-radius:14px; overflow:hidden; }
  .scope-grid .row { display:flex; justify-content:space-between; gap:16px; padding:12px 16px; border-bottom:1px solid var(--hair); font-size:13px; }
  .scope-grid .row:nth-last-child(-n+2) { border-bottom:none; }
  .scope-grid .row .k { color:var(--muted); }
  .scope-grid .row .v { color:var(--ink); font-weight:600; text-align:right; }

  /* Detailed per-control block (auditor view) */
  .control { border:1px solid var(--hair); border-radius:16px; padding:18px 20px; margin:14px 0; box-shadow:0 1px 2px rgba(0,0,0,.04); page-break-inside:avoid; }
  .control-head { display:flex; align-items:flex-start; justify-content:space-between; gap:16px; }
  .control-head .cid { font-size:12px; font-weight:700; color:var(--accent); letter-spacing:.3px; }
  .control-head .ctitle { font-size:15px; font-weight:600; color:var(--ink); margin-top:2px; }
  .control-head .ccat { font-size:11px; color:var(--faint); text-transform:uppercase; letter-spacing:.6px; margin-top:3px; }
  .control-head .cright { text-align:right; white-space:nowrap; }
  .control-head .cscore { display:block; margin-top:6px; font-size:18px; font-weight:600; letter-spacing:-.5px; color:var(--ink); }
  .control .cobj { margin:12px 0 4px; font-size:13.5px; color:var(--sub); }
  .control-grid { display:grid; grid-template-columns:1fr 1fr; gap:20px; margin-top:14px; }
  .mini-label { font-size:11px; font-weight:600; text-transform:uppercase; letter-spacing:.6px; color:var(--muted); margin-bottom:8px; }
  .ev-item { display:flex; align-items:baseline; gap:8px; padding:5px 0; border-bottom:1px solid var(--hair); font-size:12.5px; }
  .ev-item:last-child { border-bottom:none; }
  .ev-item .et { color:var(--ink); }
  .ev-item .em { color:var(--faint); font-size:11px; white-space:nowrap; }
  .ev-none { font-size:12.5px; color:var(--faint); font-style:italic; }
  .gap-chip { display:inline-block; margin:0 6px 6px 0; padding:3px 10px; border-radius:980px; background:rgba(255,59,48,.10); color:#C4231A; font-size:11.5px; }
  .control .rem { margin-top:14px; padding-top:12px; border-top:1px solid var(--hair); font-size:12.5px; color:var(--sub); }
  .control .rem .rl { font-size:11px; font-weight:600; text-transform:uppercase; letter-spacing:.6px; color:var(--muted); margin-bottom:4px; }

  .footer { margin-top:48px; padding-top:18px; border-top:1px solid var(--line); font-size:11px; color:var(--faint); text-align:center; line-height:1.7; }
  .footer .rid { color:var(--muted); }

  @media print { body { -webkit-print-color-adjust:exact; print-color-adjust:exact; } }
</style>
</head>
<body>

<div class="cover">
  <div class="brand">${brandMark}</div>
  <div class="kicker">${escapeHtml(companyName)}</div>
  <h1>${escapeHtml(reportTitle)}</h1>
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
    <div class="rid">${escapeHtml(reportId)}<br>${escapeHtml(dateText)}</div>
  </div>
  <h2>Assessment Statement</h2>
  <p>This document presents a readiness self-assessment of <strong>${escapeHtml(companyName)}</strong> against the
  <strong>${escapeHtml(framework.name)}</strong> framework (v${frameworkVersion}), covering
  <strong>${numOr0(findings.total_controls)} controls</strong>. It was generated by ComplianceGuard on ${escapeHtml(dateText)}.</p>
  <p><strong>Methodology.</strong> ComplianceGuard automatically collects evidence from connected sources and evaluates
  it against each control. The overall readiness score reflects the proportion of controls with sufficient supporting
  evidence. A total of <strong>${evidence.length} evidence item(s)</strong> were considered.</p>
  <h2 style="margin-top:28px">Scope of Assessment</h2>
  <div class="scope-grid">
    <div class="row"><span class="k">Entity</span><span class="v">${escapeHtml(companyName)}</span></div>
    <div class="row"><span class="k">Framework</span><span class="v">${escapeHtml(framework.name)} v${frameworkVersion}</span></div>
    <div class="row"><span class="k">Controls in scope</span><span class="v">${numOr0(findings.total_controls)}</span></div>
    <div class="row"><span class="k">Evidence items</span><span class="v">${evidence.length}</span></div>
    <div class="row"><span class="k">Assessment date (as of)</span><span class="v">${escapeHtml(dateText)}</span></div>
    <div class="row"><span class="k">Overall readiness</span><span class="v">${Math.round(overallScore)}%</span></div>
    <div class="row"><span class="k">${escapeHtml(criteriaLabel)} in scope</span><span class="v">${scopeCriteria.length ? escapeHtml(scopeCriteria.join(' · ')) : '—'}</span></div>
    <div class="row"><span class="k">Assessment type</span><span class="v">Readiness (point-in-time)</span></div>
  </div>
  <div class="disclaimer">This is a readiness self-assessment generated by ComplianceGuard and is not a SOC 2 attestation issued by a licensed CPA firm.</div>
  ${shortFp ? `<div class="integrity"><strong>Report fingerprint (SHA-256):</strong> <code>${escapeHtml(fingerprint)}</code><br>This fingerprint uniquely identifies this report's evaluation data; any change to the underlying results alters it.</div>` : ''}
</div>

${systemDescription ? `
<div class="statement">
  <h2>System Description</h2>
  <p style="white-space:pre-wrap;color:var(--sub);font-size:14px">${escapeHtml(systemDescription)}</p>
</div>` : ''}

<div class="content">
  <h2>Executive Summary</h2>
  <div class="summary-grid">
    <div class="summary-card total"><span class="dot"></span><div class="value">${numOr0(findings.total_controls)}</div><div class="label">Total Controls</div></div>
    <div class="summary-card compliant"><span class="dot"></span><div class="value">${numOr0(findings.compliant_controls)}</div><div class="label">Compliant</div></div>
    <div class="summary-card partial"><span class="dot"></span><div class="value">${numOr0(findings.partial_controls)}</div><div class="label">Partial</div></div>
    <div class="summary-card non-compliant"><span class="dot"></span><div class="value">${numOr0(findings.non_compliant_controls)}</div><div class="label">Non-Compliant</div></div>
  </div>

  <p>The evaluation covers <strong>${numOr0(findings.total_controls)} controls</strong> across the
  ${escapeHtml(framework.name)} framework. The overall readiness score is
  <strong>${Math.round(overallScore)}%</strong> with a status of
  <span class="status ${escapeHtml(status)}">${escapeHtml(status).replace(/_/g, ' ')}</span>.</p>
  <p><strong>Evidence items collected:</strong> ${evidence.length}</p>

  ${findings.category_scores ? `
  <h2>${escapeHtml(criteriaLabel)}</h2>
  <p style="margin-bottom:6px">This assessment covers <strong>${Object.keys(findings.category_scores).length} ${escapeHtml(isSoc2 ? 'Trust Services Criteria' : 'control domains')}</strong>, derived from the controls evaluated.</p>
  <table>
    <thead><tr><th>${escapeHtml(isSoc2 ? 'Criterion' : 'Domain')}</th><th>Score</th><th>Controls</th><th>Coverage</th></tr></thead>
    <tbody>
      ${Object.entries(findings.category_scores).map(([cat, data]) => {
        const score = Math.round(data.score || 0);
        const color = scoreColor(score);
        return `<tr>
          <td><strong>${escapeHtml(criterionName(cat))}</strong> <span style="color:var(--faint)">${escapeHtml(cat)}</span></td>
          <td>${score}%</td>
          <td>${numOr0(data.control_count)}</td>
          <td><div class="score-bar"><div class="score-bar-bg"><div class="score-bar-fill" style="width:${score}%;background:${color}"></div></div></div></td>
        </tr>`;
      }).join('')}
    </tbody>
  </table>` : ''}

  ${findings.control_results ? `
  <h2>Control Assessment Detail</h2>
  ${Object.entries(findings.control_results).map(([id, ctrl]) => {
    const evList = ctrl.evidence_details || [];
    const gaps = ctrl.gaps || [];
    const rec = recByControl[id];
    return `<div class="control">
      <div class="control-head">
        <div>
          <span class="cid">${escapeHtml(id)}</span>
          <div class="ctitle">${escapeHtml(ctrl.control_title || '')}</div>
          ${ctrl.control_category ? `<div class="ccat">${escapeHtml(criterionName(ctrl.control_category))} · ${escapeHtml(ctrl.control_category)}</div>` : ''}
        </div>
        <div class="cright">
          <span class="status ${escapeHtml(ctrl.status)}">${escapeHtml(ctrl.status || '').replace(/_/g, ' ')}</span>
          <span class="cscore">${numOr0(ctrl.score)}%</span>
        </div>
      </div>
      ${ctrl.control_description ? `<p class="cobj">${escapeHtml(ctrl.control_description)}</p>` : ''}
      <div class="control-grid">
        <div>
          <div class="mini-label">Evidence on file (${numOr0(ctrl.evidence_count)})</div>
          ${evList.length ? evList.map(e => `<div class="ev-item"><span class="et">${escapeHtml(e.title || e.type || 'Evidence')}</span><span class="em">${escapeHtml((e.type || '').replace(/_/g, ' '))}${e.collected_at ? ' · ' + escapeHtml(new Date(e.collected_at).toLocaleDateString()) : ''}</span></div>`).join('') : '<div class="ev-none">No evidence collected for this control.</div>'}
        </div>
        <div>
          <div class="mini-label">Evidence still required (${gaps.length})</div>
          ${gaps.length ? gaps.map(g => `<span class="gap-chip">${escapeHtml(String(g).replace(/_/g, ' '))}</span>`).join('') : '<div class="ev-none">All required evidence types satisfied.</div>'}
        </div>
      </div>
      ${rec ? `<div class="rem"><div class="rl">Remediation — ${escapeHtml(rec.priority || 'medium')} priority</div>${escapeHtml(rec.recommendation || '')}</div>` : ''}
    </div>`;
  }).join('')}` : ''}

  <h2>Evidence Register</h2>
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
module.exports.criterionName = criterionName;
module.exports.criteriaInScope = criteriaInScope;
