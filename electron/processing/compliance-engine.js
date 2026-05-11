const log = require('../logger');
const path = require('path');
const fs = require('fs');
const yaml = require('js-yaml');
const { FREE_TIER_CONTROL_IDS } = require('../licensing/tier-constants');

class LocalComplianceEngine {
  constructor(database, licenseManager = null) {
    this.db = database;
    this.licenseManager = licenseManager;
    this.frameworks = this._loadFrameworks();
  }

  _loadFrameworks() {
    const dataDir = path.join(__dirname, '..', 'data');
    const defs = {
      1: { name: 'SOC 2 Type II',       file: 'soc2_controls.yaml' },
      2: { name: 'ISO 27001:2013',       file: 'iso27001_controls.yaml' },
      3: { name: 'HIPAA Security Rule',  file: 'hipaa_controls.yaml' },
    };

    const frameworks = {};
    for (const [id, meta] of Object.entries(defs)) {
      try {
        const raw = fs.readFileSync(path.join(dataDir, meta.file), 'utf8');
        const parsed = yaml.load(raw);
        frameworks[Number(id)] = {
          name: meta.name,
          controls: (parsed.controls || []).map(c => ({
            id: c.id,
            title: c.title || '',
            category: c.category || 'General',
            evidenceTypes: Array.isArray(c.evidence_types) ? c.evidence_types : [],
            weight: typeof c.weight === 'number' ? c.weight : 1,
          })),
        };
      } catch (err) {
        log.error(`Failed to load framework ${meta.file}:`, err);
        frameworks[Number(id)] = { name: meta.name, controls: [] };
      }
    }
    return frameworks;
  }

  async evaluateCompliance(frameworkId) {
    const fw = this.frameworks[frameworkId];
    if (!fw) throw new Error(`Framework not found: ${frameworkId}`);

    const evidence = await this.db.getAllEvidence();

    const evaluationResults = {
      framework_id: frameworkId,
      framework_name: fw.name,
      evaluation_date: new Date().toISOString(),
      overall_score: 0,
      total_controls: 0,
      compliant_controls: 0,
      non_compliant_controls: 0,
      partial_controls: 0,
      not_assessed_controls: 0,
      category_scores: {},
      control_results: {},
      recommendations: []
    };

    const allowedIds = this.licenseManager
      ? this.licenseManager.getControlIds()
      : FREE_TIER_CONTROL_IDS;

    const byCategory = {};
    for (const control of fw.controls) {
      if (!byCategory[control.category]) byCategory[control.category] = [];
      byCategory[control.category].push(control);
    }

    let totalWeight = 0;
    let weightedScore = 0;

    for (const [category, categoryControls] of Object.entries(byCategory)) {
      let categoryScore = 0;
      let categoryWeight = 0;

      for (const control of categoryControls) {
        if (allowedIds && !allowedIds.includes(control.id)) continue;

        const controlResult = this.evaluateControl(control, evidence);
        evaluationResults.control_results[control.id] = controlResult;
        evaluationResults.total_controls++;

        categoryScore += controlResult.score * control.weight;
        categoryWeight += control.weight;

        switch (controlResult.status) {
          case 'compliant':     evaluationResults.compliant_controls++;     break;
          case 'non_compliant': evaluationResults.non_compliant_controls++;  break;
          case 'partial':       evaluationResults.partial_controls++;        break;
          default:              evaluationResults.not_assessed_controls++;
        }

        if (controlResult.status !== 'compliant') {
          evaluationResults.recommendations.push({
            control_id: control.id,
            priority: controlResult.status === 'non_compliant' ? 'high' : 'medium',
            recommendation: this.generateRecommendation(control, controlResult),
            evidence_needed: control.evidenceTypes.filter(
              type => !controlResult.available_evidence.includes(type)
            )
          });
        }
      }

      const normalizedCategoryScore = categoryWeight > 0 ? (categoryScore / categoryWeight) : 0;
      evaluationResults.category_scores[category] = {
        score: normalizedCategoryScore,
        weight: categoryWeight,
        control_count: categoryControls.length
      };
      weightedScore += normalizedCategoryScore * categoryWeight;
      totalWeight += categoryWeight;
    }

    evaluationResults.overall_score = totalWeight > 0 ? (weightedScore / totalWeight) : 0;

    if (evaluationResults.overall_score >= 90) {
      evaluationResults.status = 'compliant';
    } else if (evaluationResults.overall_score >= 70) {
      evaluationResults.status = 'partial';
    } else {
      evaluationResults.status = 'non_compliant';
    }

    const evaluationId = await this.db.createEvaluation(frameworkId, evaluationResults);
    evaluationResults.id = evaluationId;

    const tier = this.licenseManager ? this.licenseManager.getTier() : 'free';
    evaluationResults.tier = tier;

    if (tier === 'free') {
      evaluationResults.category_scores = null;
      evaluationResults.control_results = null;
      evaluationResults.recommendations = [];
    }

    return evaluationResults;
  }

  evaluateControl(control, evidence) {
    const result = {
      control_id: control.id,
      control_title: control.title,
      control_category: control.category,
      required_evidence: control.evidenceTypes,
      available_evidence: [],
      evidence_count: 0,
      score: 0,
      status: 'not_assessed',
      gaps: [],
      evidence_details: []
    };

    const matched = evidence.filter(item =>
      control.evidenceTypes.includes(item.evidence_type)
    );

    matched.forEach(item => {
      if (!result.available_evidence.includes(item.evidence_type)) {
        result.available_evidence.push(item.evidence_type);
      }
      result.evidence_details.push({
        id: item.id,
        type: item.evidence_type,
        title: item.title,
        collected_at: item.collected_at,
        file_path: item.file_path
      });
    });

    result.evidence_count = matched.length;

    const coverageRatio = control.evidenceTypes.length > 0
      ? result.available_evidence.length / control.evidenceTypes.length
      : 0;
    result.score = Math.round(coverageRatio * 100);

    if (result.available_evidence.length === 0) {
      result.status = 'not_assessed';
    } else if (coverageRatio >= 0.9) {
      result.status = 'compliant';
    } else if (coverageRatio >= 0.5) {
      result.status = 'partial';
    } else {
      result.status = 'non_compliant';
    }

    result.gaps = control.evidenceTypes.filter(
      type => !result.available_evidence.includes(type)
    );

    return result;
  }

  generateRecommendation(control, controlResult) {
    const gapCount = controlResult.gaps.length;
    const totalRequired = control.evidenceTypes.length;

    if (gapCount === totalRequired) {
      return `This control requires complete evidence collection. Start by gathering: ${control.evidenceTypes.join(', ')}`;
    } else if (gapCount > totalRequired / 2) {
      return `Significant evidence gaps exist. Priority should be given to collecting: ${controlResult.gaps.slice(0, 3).join(', ')}`;
    } else {
      return `Minor evidence gaps need to be addressed: ${controlResult.gaps.join(', ')}`;
    }
  }

  async generateComplianceReport(frameworkId, format = 'detailed') {
    const evaluation = await this.db.getLatestEvaluation(frameworkId);
    if (!evaluation) {
      throw new Error('No evaluation found. Run an evaluation first.');
    }

    const fw = this.frameworks[frameworkId];
    const fwName = fw ? fw.name : `Framework ${frameworkId}`;
    const evidence = await this.db.getAllEvidence();
    const findings = evaluation.findings || {};

    const report = {
      report_info: {
        title: `${fwName} Compliance Report`,
        generated_at: new Date().toISOString(),
        framework_id: frameworkId,
      },
      executive_summary: {
        overall_score: findings.overall_score || evaluation.overall_score || 0,
        status: findings.status || evaluation.status,
        total_controls: findings.total_controls || 0,
        compliant_controls: findings.compliant_controls || 0,
        non_compliant_controls: findings.non_compliant_controls || 0,
        partial_controls: findings.partial_controls || 0
      },
      category_breakdown: findings.category_scores || {},
      control_details: findings.control_results || {},
      recommendations: findings.recommendations || [],
      evidence_summary: this.generateEvidenceSummary(evidence)
    };

    if (format === 'summary') {
      return {
        report_info: report.report_info,
        executive_summary: report.executive_summary,
        top_recommendations: (findings.recommendations || [])
          .filter(rec => rec.priority === 'high')
          .slice(0, 5)
      };
    }

    return report;
  }

  generateEvidenceSummary(evidence) {
    const summary = {
      total_evidence: evidence.length,
      evidence_types: {},
      collection_period: { earliest: null, latest: null },
      file_evidence: 0,
      metadata_evidence: 0
    };

    evidence.forEach(item => {
      summary.evidence_types[item.evidence_type] =
        (summary.evidence_types[item.evidence_type] || 0) + 1;

      const collectedAt = new Date(item.collected_at);
      if (!summary.collection_period.earliest || collectedAt < new Date(summary.collection_period.earliest)) {
        summary.collection_period.earliest = item.collected_at;
      }
      if (!summary.collection_period.latest || collectedAt > new Date(summary.collection_period.latest)) {
        summary.collection_period.latest = item.collected_at;
      }

      if (item.file_path) {
        summary.file_evidence++;
      } else {
        summary.metadata_evidence++;
      }
    });

    return summary;
  }
}

module.exports = LocalComplianceEngine;
