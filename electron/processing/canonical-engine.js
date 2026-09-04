/**
 * Canonical scoring engine (Electron port).
 *
 * Faithful JS port of backend/app/core/canonical_evidence.py — same data
 * sources (shared/frameworks/*), same algorithm, same rounding. The
 * cross-engine equivalence suite (canonical-equivalence.test.js) asserts the
 * two implementations produce identical results over a fixture matrix.
 *
 * Scoring semantics (ratified Phase 3 spec):
 *   - coverage(c) = |present(c) ∩ required(c)| / |required(c)|
 *   - status: 0 → not_assessed; <0.5 → non_compliant; 0.5–0.99 → partial; 1.0 → compliant
 *   - overall = Σ coverage(c) / N over ALL controls (not_assessed included)
 *   - score thresholds: ≥90 compliant, ≥70 partial (0–100 scale)
 *   - all controls not_assessed → overall status not_assessed (CG-M2), never non_compliant
 *
 * Legacy translation: evidence stored under the old Python vocabulary is
 * translated to canonical types via shared/frameworks/evidence-vocabulary.json
 * (legacy_aliases). Types with no alias can only be satisfied by manual upload.
 */
const fs = require('fs');
const path = require('path');
const yaml = require('js-yaml');

const FRAMEWORK_IDS = {
  soc2: 'soc2_v2017',
  iso27001: 'iso27001_v2013',
  hipaa: 'hipaa_security_rule',
  gdpr: 'gdpr_2016_679',
};

// Desktop numeric framework ids (the compliance_frameworks table) -> canonical key.
const FRAMEWORK_KEYS = {
  1: 'soc2',
  2: 'iso27001',
  3: 'hipaa',
  4: 'gdpr',
};

const FRAMEWORK_NAMES = {
  soc2: 'SOC 2 Type II',
  iso27001: 'ISO 27001:2013',
  hipaa: 'HIPAA Security Rule',
  gdpr: 'GDPR',
};

const FRAMEWORK_FILES = {
  soc2: 'soc2_controls.yaml',
  iso27001: 'iso27001_controls.yaml',
  hipaa: 'hipaa_controls.yaml',
  gdpr: 'gdpr_controls.yaml',
};

const STATUS = {
  COMPLIANT: 'compliant',
  PARTIAL: 'partial',
  NON_COMPLIANT: 'non_compliant',
  NOT_ASSESSED: 'not_assessed',
};

function sharedDir() {
  // repo layout: <root>/shared/frameworks ; packaged app includes shared/**.
  return path.join(__dirname, '..', '..', 'shared', 'frameworks');
}

class EvidenceVocabulary {
  constructor(data) {
    this.data = data;
    this.canonicalTypes = new Set(data.canonical_types.map((t) => t.type));
    this.aliasToCanonical = {};
    for (const entry of data.canonical_types) {
      for (const alias of entry.legacy_aliases || []) {
        // First alias wins (deterministic; mirrors the Python port).
        if (!(alias in this.aliasToCanonical)) {
          this.aliasToCanonical[alias] = entry.type;
        }
      }
    }
  }

  translate(evidenceTypes) {
    const canonical = new Set();
    for (const t of evidenceTypes) {
      if (this.canonicalTypes.has(t)) canonical.add(t);
      else if (t in this.aliasToCanonical) canonical.add(this.aliasToCanonical[t]);
    }
    return canonical;
  }

  static load() {
    const raw = fs.readFileSync(path.join(sharedDir(), 'evidence-vocabulary.json'), 'utf8');
    return new EvidenceVocabulary(JSON.parse(raw));
  }
}

class CanonicalEngine {
  constructor() {
    this.vocabulary = EvidenceVocabulary.load();
    this._frameworks = {};
  }

  _loadFramework(frameworkKey) {
    if (this._frameworks[frameworkKey]) return this._frameworks[frameworkKey];
    const file = FRAMEWORK_FILES[frameworkKey];
    if (!file) throw new Error(`Unknown framework key: ${frameworkKey}`);
    const p = path.join(sharedDir(), file);
    if (!fs.existsSync(p)) {
      throw new Error(`Canonical framework data missing: ${p}`);
    }
    const data = yaml.load(fs.readFileSync(p, 'utf8'));
    this._frameworks[frameworkKey] = data;
    return data;
  }

  /**
   * Score a framework against a set of evidence types (canonical or legacy).
   * Returns the same shape as the Python port's CanonicalEvaluation.
   */
  evaluate(frameworkKey, evidenceTypes) {
    const data = this._loadFramework(frameworkKey);
    const present = this.vocabulary.translate(evidenceTypes);

    const controlResults = {};
    const categoryTotals = {};

    for (const control of data.controls) {
      const required = (control.required_evidence || []).slice().sort();
      const available = required.filter((t) => present.has(t));
      const gaps = required.filter((t) => !present.has(t));
      const requiredCount = required.length;
      const coverage = requiredCount > 0 ? available.length / requiredCount : 0;

      let status;
      if (available.length === 0) status = STATUS.NOT_ASSESSED;
      else if (coverage >= 1.0) status = STATUS.COMPLIANT;
      else if (coverage >= 0.5) status = STATUS.PARTIAL;
      else status = STATUS.NON_COMPLIANT;

      const score = Math.round(coverage * 100);

      controlResults[control.id] = {
        control_id: control.id,
        score,
        status,
        required_evidence: required,
        available_evidence: available,
        gaps,
      };

      if (!categoryTotals[control.category]) categoryTotals[control.category] = [];
      categoryTotals[control.category].push(score);
    }

    const counts = {
      [STATUS.COMPLIANT]: 0,
      [STATUS.PARTIAL]: 0,
      [STATUS.NON_COMPLIANT]: 0,
      [STATUS.NOT_ASSESSED]: 0,
    };
    for (const r of Object.values(controlResults)) counts[r.status] += 1;

    const categoryScores = {};
    for (const [category, scores] of Object.entries(categoryTotals)) {
      categoryScores[category] = {
        score: Math.round((scores.reduce((a, b) => a + b, 0) / scores.length) * 100) / 100,
        weight: scores.length,
        control_count: scores.length,
      };
    }

    const ids = Object.keys(controlResults);
    const total = ids.length;
    const overall = total > 0
      ? ids.reduce((sum, id) => sum + controlResults[id].score, 0) / total
      : 0;

    // CG-M2: with every control not_assessed there is nothing to be
    // non-compliant about — the overall status must say "not assessed", not
    // "non compliant". Label-only change: the numeric average is unchanged.
    const allNotAssessed = Object.values(controlResults).every(
      (r) => r.status === STATUS.NOT_ASSESSED,
    );
    let status;
    if (allNotAssessed) status = STATUS.NOT_ASSESSED;
    else if (overall >= 90) status = STATUS.COMPLIANT;
    else if (overall >= 70) status = STATUS.PARTIAL;
    else status = STATUS.NON_COMPLIANT;

    return {
      framework_key: frameworkKey,
      framework_id: (data.framework && data.framework.id) || FRAMEWORK_IDS[frameworkKey],
      framework_name: (data.framework && data.framework.name) || frameworkKey,
      overall_score: overall,
      status,
      control_results: controlResults,
      counts,
      category_scores: categoryScores,
    };
  }

  /**
   * Evaluate + persist, returning the legacy Electron evaluation shape so the
   * IPC layer, evaluation history, and report generator keep working unchanged.
   *
   * @param {number} frameworkId desktop numeric id (1-4)
   * @param {string[]} evidenceTypes canonical or legacy evidence types
   * @param {object} db ComplianceGuardDatabase (needs createEvaluation)
   */
  async evaluateAndPersist(frameworkId, evidenceTypes, db) {
    const key = FRAMEWORK_KEYS[frameworkId];
    if (!key) throw new Error(`Framework not found: ${frameworkId}`);
    const ev = this.evaluate(key, evidenceTypes);

    const findings = {
      framework_id: frameworkId,
      framework_name: ev.framework_name || FRAMEWORK_NAMES[key],
      evaluation_date: new Date().toISOString(),
      overall_score: ev.overall_score,
      status: ev.status,
      total_controls: Object.keys(ev.control_results).length,
      compliant_controls: ev.counts[STATUS.COMPLIANT] || 0,
      non_compliant_controls: ev.counts[STATUS.NON_COMPLIANT] || 0,
      partial_controls: ev.counts[STATUS.PARTIAL] || 0,
      not_assessed_controls: ev.counts[STATUS.NOT_ASSESSED] || 0,
      category_scores: ev.category_scores,
      control_results: ev.control_results,
      evidence_count: evidenceTypes.length,
      recommendations: this._recommendations(ev),
    };

    const id = await db.createEvaluation(frameworkId, findings);
    return { id, ...findings };
  }

  _recommendations(ev) {
    const recs = [];
    for (const [cid, r] of Object.entries(ev.control_results)) {
      if (r.status === STATUS.COMPLIANT) continue;
      const priority = r.status === STATUS.NON_COMPLIANT ? 'high' : 'medium';
      let recommendation;
      if (r.status === STATUS.NOT_ASSESSED) {
        recommendation = `No evidence collected for this control. Start by gathering: ${r.required_evidence.join(', ')}`;
      } else {
        recommendation = `Incomplete evidence. Missing: ${r.gaps.join(', ')}`;
      }
      recs.push({ control_id: cid, priority, recommendation, evidence_needed: r.gaps });
    }
    return recs;
  }
}

module.exports = { CanonicalEngine, EvidenceVocabulary, STATUS, FRAMEWORK_KEYS };
