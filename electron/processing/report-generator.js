const fs = require('fs');
const path = require('path');

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
class ReportGenerator {
  constructor(database) {
    this.db = database;
  }

  /**
   * Generate a full HTML compliance report that Electron can print to PDF.
   */
  async generateHTMLReport(frameworkId) {
    const framework = await this.db.getFrameworkById(frameworkId);
    if (!framework) throw new Error('Framework not found');

    const evaluation = await this.db.getLatestEvaluation(frameworkId);
    const evidence = await this.db.getEvidenceByFramework(frameworkId);
    const findings = evaluation?.findings || {};

    const now = new Date();
    const overallScore = findings.overall_score || evaluation?.overall_score || 0;
    const status = findings.status || evaluation?.status || 'not_assessed';

    const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<title>ComplianceGuard - ${escapeHtml(framework.name)} Compliance Report</title>
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body {
    font-family: 'Segoe UI', 'Helvetica Neue', Arial, sans-serif;
    color: #1a1a2e;
    line-height: 1.6;
    padding: 0;
  }

  /* Cover page */
  .cover {
    page-break-after: always;
    height: 100vh;
    display: flex;
    flex-direction: column;
    justify-content: center;
    align-items: center;
    background: linear-gradient(135deg, #0D1B2A 0%, #1B2838 40%, #0A2540 100%);
    color: white;
    text-align: center;
    padding: 60px;
  }
  .cover h1 {
    font-size: 42px;
    font-weight: 700;
    margin-bottom: 8px;
    letter-spacing: -1px;
  }
  .cover .tagline {
    font-size: 16px;
    color: #90CAF9;
    letter-spacing: 3px;
    text-transform: uppercase;
    margin-bottom: 40px;
  }
  .cover .report-title {
    font-size: 28px;
    font-weight: 300;
    margin-bottom: 8px;
  }
  .cover .report-date {
    font-size: 16px;
    color: #B0BEC5;
  }
  .cover .score-badge {
    margin-top: 40px;
    padding: 20px 40px;
    border-radius: 12px;
    background: rgba(255,255,255,0.1);
    border: 1px solid rgba(255,255,255,0.2);
  }
  .cover .score-value {
    font-size: 64px;
    font-weight: 700;
    color: ${overallScore >= 90 ? '#66BB6A' : overallScore >= 70 ? '#FFA726' : '#EF5350'};
  }
  .cover .score-label {
    font-size: 14px;
    color: #B0BEC5;
    text-transform: uppercase;
    letter-spacing: 2px;
  }

  /* Content pages */
  .content {
    padding: 40px 50px;
  }
  h2 {
    font-size: 22px;
    font-weight: 600;
    color: #0D47A1;
    border-bottom: 2px solid #E3F2FD;
    padding-bottom: 8px;
    margin: 30px 0 16px 0;
  }
  h3 {
    font-size: 16px;
    font-weight: 600;
    color: #1565C0;
    margin: 20px 0 10px 0;
  }

  /* Executive summary cards */
  .summary-grid {
    display: grid;
    grid-template-columns: repeat(4, 1fr);
    gap: 16px;
    margin: 16px 0 24px 0;
  }
  .summary-card {
    background: #F5F7FA;
    border-radius: 8px;
    padding: 16px;
    text-align: center;
    border-left: 4px solid #1565C0;
  }
  .summary-card.compliant { border-left-color: #66BB6A; }
  .summary-card.partial { border-left-color: #FFA726; }
  .summary-card.non-compliant { border-left-color: #EF5350; }
  .summary-card.total { border-left-color: #1565C0; }
  .summary-card .value {
    font-size: 32px;
    font-weight: 700;
  }
  .summary-card .label {
    font-size: 12px;
    color: #666;
    text-transform: uppercase;
    letter-spacing: 1px;
  }

  /* Tables */
  table {
    width: 100%;
    border-collapse: collapse;
    margin: 12px 0 24px 0;
    font-size: 13px;
  }
  th {
    background: #0D47A1;
    color: white;
    padding: 10px 12px;
    text-align: left;
    font-weight: 500;
  }
  td {
    padding: 8px 12px;
    border-bottom: 1px solid #E0E0E0;
  }
  tr:nth-child(even) { background: #FAFAFA; }
  tr:hover { background: #F0F4FF; }

  /* Status badges */
  .status {
    display: inline-block;
    padding: 2px 10px;
    border-radius: 12px;
    font-size: 11px;
    font-weight: 600;
    text-transform: uppercase;
  }
  .status.compliant { background: #E8F5E9; color: #2E7D32; }
  .status.partial { background: #FFF3E0; color: #E65100; }
  .status.non_compliant, .status.non-compliant { background: #FFEBEE; color: #C62828; }
  .status.not_assessed, .status.not-assessed { background: #F5F5F5; color: #757575; }

  /* Score bar */
  .score-bar {
    display: flex;
    align-items: center;
    gap: 8px;
  }
  .score-bar-bg {
    flex: 1;
    height: 8px;
    background: #E0E0E0;
    border-radius: 4px;
    overflow: hidden;
  }
  .score-bar-fill {
    height: 100%;
    border-radius: 4px;
  }
  .score-bar-value {
    font-weight: 600;
    font-size: 13px;
    min-width: 40px;
  }

  /* Recommendations */
  .recommendation {
    background: #FFF8E1;
    border-left: 4px solid #FFA726;
    padding: 12px 16px;
    margin: 8px 0;
    border-radius: 0 4px 4px 0;
  }
  .recommendation.high {
    background: #FFEBEE;
    border-left-color: #EF5350;
  }
  .recommendation .priority {
    font-size: 11px;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 1px;
    margin-bottom: 4px;
  }
  .recommendation.high .priority { color: #C62828; }
  .recommendation .priority { color: #E65100; }

  /* Footer */
  .footer {
    margin-top: 40px;
    padding-top: 16px;
    border-top: 1px solid #E0E0E0;
    font-size: 11px;
    color: #999;
    text-align: center;
  }

  @media print {
    .cover { height: auto; min-height: 100vh; }
    body { font-size: 12px; }
  }
</style>
</head>
<body>

<!-- Cover Page -->
<div class="cover">
  <h1>ComplianceGuard</h1>
  <div class="tagline">Collect. Evaluate. Comply.</div>
  <div class="report-title">${escapeHtml(framework.name)} Compliance Report</div>
  <div class="report-date">Generated: ${now.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}</div>
  <div class="score-badge">
    <div class="score-value">${Math.round(overallScore)}%</div>
    <div class="score-label">Overall Compliance Score</div>
  </div>
</div>

<!-- Executive Summary -->
<div class="content">
  <h2>Executive Summary</h2>
  <div class="summary-grid">
    <div class="summary-card total">
      <div class="value">${findings.total_controls || 0}</div>
      <div class="label">Total Controls</div>
    </div>
    <div class="summary-card compliant">
      <div class="value" style="color:#2E7D32">${findings.compliant_controls || 0}</div>
      <div class="label">Compliant</div>
    </div>
    <div class="summary-card partial">
      <div class="value" style="color:#E65100">${findings.partial_controls || 0}</div>
      <div class="label">Partial</div>
    </div>
    <div class="summary-card non-compliant">
      <div class="value" style="color:#C62828">${findings.non_compliant_controls || 0}</div>
      <div class="label">Non-Compliant</div>
    </div>
  </div>

  <p>This report was generated by ComplianceGuard on <strong>${now.toISOString()}</strong>.
  The evaluation covers <strong>${findings.total_controls || 0} controls</strong> across the
  ${escapeHtml(framework.name)} framework. The overall compliance score is
  <strong>${Math.round(overallScore)}%</strong> with a status of
  <span class="status ${escapeHtml(status)}">${escapeHtml(status).replace(/_/g, ' ')}</span>.</p>

  <p><strong>Evidence items collected:</strong> ${evidence.length}</p>

  ${findings.category_scores ? `
  <h2>Category Scores</h2>
  <table>
    <thead>
      <tr>
        <th>Category</th>
        <th>Score</th>
        <th>Controls</th>
        <th>Visual</th>
      </tr>
    </thead>
    <tbody>
      ${Object.entries(findings.category_scores).map(([cat, data]) => {
        const score = Math.round(data.score || 0);
        const color = score >= 90 ? '#66BB6A' : score >= 70 ? '#FFA726' : '#EF5350';
        return `<tr>
          <td><strong>${escapeHtml(cat)}</strong></td>
          <td>${score}%</td>
          <td>${data.control_count || 0}</td>
          <td>
            <div class="score-bar">
              <div class="score-bar-bg"><div class="score-bar-fill" style="width:${score}%;background:${color}"></div></div>
            </div>
          </td>
        </tr>`;
      }).join('')}
    </tbody>
  </table>
  ` : ''}

  ${findings.control_results ? `
  <h2>Control Assessment Details</h2>
  <table>
    <thead>
      <tr>
        <th>Control ID</th>
        <th>Title</th>
        <th>Score</th>
        <th>Status</th>
        <th>Evidence</th>
        <th>Gaps</th>
      </tr>
    </thead>
    <tbody>
      ${Object.entries(findings.control_results).map(([id, ctrl]) => `<tr>
        <td><strong>${escapeHtml(id)}</strong></td>
        <td>${escapeHtml(ctrl.control_title || '')}</td>
        <td>${ctrl.score || 0}%</td>
        <td><span class="status ${escapeHtml(ctrl.status)}">${escapeHtml(ctrl.status || '').replace(/_/g, ' ')}</span></td>
        <td>${ctrl.evidence_count || 0}</td>
        <td>${(ctrl.gaps || []).length}</td>
      </tr>`).join('')}
    </tbody>
  </table>
  ` : ''}

  ${findings.recommendations && findings.recommendations.length > 0 ? `
  <h2>Recommendations</h2>
  ${findings.recommendations.map(rec => `
    <div class="recommendation ${escapeHtml(rec.priority || 'medium')}">
      <div class="priority">${escapeHtml(rec.priority || 'medium')} priority — ${escapeHtml(rec.control_id)}</div>
      <div>${escapeHtml(rec.recommendation)}</div>
      ${rec.evidence_needed && rec.evidence_needed.length > 0 ?
        `<div style="margin-top:6px;font-size:12px;color:#666"><strong>Evidence needed:</strong> ${rec.evidence_needed.map(e => escapeHtml(e)).join(', ')}</div>` : ''}
    </div>
  `).join('')}
  ` : ''}

  <h2>Evidence Summary</h2>
  <table>
    <thead>
      <tr>
        <th>#</th>
        <th>Title</th>
        <th>Type</th>
        <th>Control</th>
        <th>Collected</th>
      </tr>
    </thead>
    <tbody>
      ${evidence.slice(0, 50).map((item, i) => `<tr>
        <td>${i + 1}</td>
        <td>${escapeHtml(item.title)}</td>
        <td>${escapeHtml(item.evidence_type || '').replace(/_/g, ' ')}</td>
        <td>${escapeHtml(item.control_id)}</td>
        <td>${item.collected_at ? new Date(item.collected_at).toLocaleDateString() : 'N/A'}</td>
      </tr>`).join('')}
      ${evidence.length > 50 ? `<tr><td colspan="5" style="text-align:center;color:#999">... and ${evidence.length - 50} more items</td></tr>` : ''}
    </tbody>
  </table>

  <div class="footer">
    ComplianceGuard — Collect. Evaluate. Comply.<br>
    Report generated on ${now.toISOString()} | Framework: ${escapeHtml(framework.name)} v${escapeHtml(framework.version || '2017')}
  </div>
</div>

</body>
</html>`;

    return html;
  }
}

module.exports = ReportGenerator;
