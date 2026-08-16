/*
EvidenceUpload data + payload types (extracted from EvidenceUpload.tsx so the
component stays focused on the dialog UI).

The upload catalog (SOC2_CONTROLS, getCategoryForType) is GENERATED from the
canonical shared framework data — see evidenceCatalog.generated.ts and
scripts/generate-evidence-catalog.mjs. Every type a user can select is a
canonical type the scoring engine accepts for that control; the Phase 10
"97 dead upload types" class of bug cannot return.
*/

export {
  CANONICAL_EVIDENCE_TYPES,
  getCategoryForType,
  SOC2_CONTROLS,
} from './evidenceCatalog.generated';
export type { CanonicalEvidenceType, Soc2ControlOption } from './evidenceCatalog.generated';

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
