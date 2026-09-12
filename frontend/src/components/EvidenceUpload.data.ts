/*
EvidenceUpload data + payload types (extracted from EvidenceUpload.tsx so the
component stays focused on the dialog UI).

The upload catalog (per-framework controls, getCategoryForType) is GENERATED
from the canonical shared framework data — see evidenceCatalog.generated.ts and
scripts/generate-evidence-catalog.mjs. Every type a user can select is a
canonical type the scoring engine accepts for that control; the Phase 10
"97 dead upload types" class of bug cannot return.
*/

import {
  GDPR_CONTROLS,
  HIPAA_CONTROLS,
  ISO27001_CONTROLS,
  SOC2_CONTROLS,
  type FrameworkControlOption,
} from './evidenceCatalog.generated';

export type FrameworkId = 1 | 2 | 3 | 4;

export { CANONICAL_EVIDENCE_TYPES, getCategoryForType } from './evidenceCatalog.generated';
export type { CanonicalEvidenceType, FrameworkControlOption } from './evidenceCatalog.generated';

/** Controls (with their canonical evidence types) per framework id. */
export const CONTROLS_BY_FRAMEWORK: Record<FrameworkId, FrameworkControlOption[]> = {
  1: SOC2_CONTROLS,
  2: ISO27001_CONTROLS,
  3: HIPAA_CONTROLS,
  4: GDPR_CONTROLS,
};

export const FRAMEWORK_LABELS: Record<FrameworkId, string> = {
  1: 'SOC 2',
  2: 'ISO 27001',
  3: 'HIPAA',
  4: 'GDPR',
};

/** Unit used in framework UI copy ("criteria", "controls", "obligations"). */
export const FRAMEWORK_CONTROL_UNIT: Record<FrameworkId, string> = {
  1: 'criteria',
  2: 'controls',
  3: 'safeguards',
  4: 'obligations',
};

/** Manual-evidence payload sent to the main process (file mode). */
export interface FileEvidencePayload {
  controlId: string;
  evidenceType: string;
  title: string;
  description: string;
  fileName: string;
  file: { buffer: number[] };
  category: string;
}

/** Manual-evidence payload sent to the main process (text mode). */
export interface TextEvidencePayload {
  controlId: string;
  evidenceType: string;
  title: string;
  description: string;
  content: string;
  contentType: 'text';
}

export type ManualEvidencePayload = FileEvidencePayload | TextEvidencePayload;
