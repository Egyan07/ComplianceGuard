const path = require('path');
const fs = require('fs');

// Non-scoring storage values that are legitimate but never feed the engine.
const NON_SCORING_EVIDENCE_TYPES = ['manual_upload', 'document', 'text', 'unknown'];

function sharedDir() {
  // repo layout: <root>/shared/frameworks ; packaged app includes shared/**.
  return path.join(__dirname, '..', '..', 'shared', 'frameworks');
}

function loadVocabulary() {
  const raw = fs.readFileSync(
    path.join(sharedDir(), 'evidence-vocabulary.json'),
    'utf8'
  );
  return JSON.parse(raw);
}

const _vocab = loadVocabulary();
const _canonical = new Set(_vocab.canonical_types.map((t) => t.type));
const _aliases = new Set();
for (const entry of _vocab.canonical_types) {
  for (const alias of entry.legacy_aliases || []) _aliases.add(alias);
}
const _nonScoring = new Set(NON_SCORING_EVIDENCE_TYPES);

/**
 * True when the type is canonical, a validated legacy alias, or a known
 * non-scoring storage default. False for the dead types the old upload UI
 * exposed (types the engine can never score).
 */
function isKnownEvidenceType(evidenceType) {
  if (typeof evidenceType !== 'string' || evidenceType.length === 0) return false;
  return _canonical.has(evidenceType) || _aliases.has(evidenceType) || _nonScoring.has(evidenceType);
}

module.exports = { isKnownEvidenceType, NON_SCORING_EVIDENCE_TYPES };
