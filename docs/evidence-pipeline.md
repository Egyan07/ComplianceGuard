# Evidence Pipeline & Collector Coverage Matrix

Phase 11 documentation of the evidence pipeline — what can be produced, what
each type means, and where the product ceiling sits. Source of truth:
`shared/frameworks/evidence-vocabulary.json` and `shared/frameworks/*_controls.yaml`.

## Pipeline

```
Collectors                      Canonical Evidence Model          Scoring
──────────                      ──────────────────────            ───────
Windows/macOS collector  ─┐
AWS collector            ─┤→ evidence_type ─→ translate() ─→ required_evidence
Manual upload (UI)       ─┘   (13 canonical types)                per control
                                │ legacy aliases
                                ▼
                     shared/frameworks/evidence-vocabulary.json
```

- Collectors and the upload UI emit **evidence_type** strings.
- `translate()` maps legacy aliases (e.g. `iam_policy` → `user_provisioning`)
  to canonical types; unknown types are **rejected at the persistence boundary**
  since Phase 11 (API `validate_evidence_type`, desktop `isKnownEvidenceType`).
- Each control's `required_evidence` (the shared YAMLs) decides which types
  satisfy it; scoring is coverage-based over those lists.

## Evidence Type Matrix

| Evidence Type | Producers | SOC 2 controls | ISO 27001 controls | HIPAA controls | GDPR controls | Manual/Automatic |
|---|---|---|---|---|---|---|
| access_logs | manual | 2 | 0 | 0 | 2 | Manual only |
| audit_reports | manual | 33 | 18 | 27 | 14 | Manual only |
| backup_logs | manual | 4 | 3 | 0 | 1 | Manual only |
| encryption_policies | manual (+ AWS via `s3_encryption` alias) | 1 | 2 | 2 | 2 | Manual; AWS alias auto |
| event_logs | windows/macos/aws collector, manual | 11 | 4 | 2 | 4 | Automatic + manual |
| firewall_configs | windows/macos collector, manual | 2 | 3 | 0 | 1 | Automatic + manual |
| incident_reports | manual | 2 | 3 | 1 | 2 | Manual only |
| network_configs | windows/macos collector, manual | 3 | 3 | 2 | 1 | Automatic + manual |
| policy_document | manual | 33 | 24 | 26 | 26 | Manual only |
| security_policies | windows/macos collector, manual | 2 | 9 | 13 | 13 | Automatic + manual |
| system_configs | windows/macos collector, manual | 11 | 15 | 8 | 9 | Automatic + manual |
| training_records | manual | 4 | 1 | 4 | 0 | Manual only |
| user_provisioning | windows/macos collector (+ AWS via `iam_policy` alias), manual | 3 | 10 | 10 | 3 | Automatic + manual |

Counts = number of controls in that framework whose `required_evidence` lists
the type. Verified against the canonical YAMLs (control counts 54/47/47/38).

## Reachability

- **All 13 canonical types are reachable** (every type can be produced by at
  least one path: collector, AWS alias, or manual upload). No dead types.
- **Collector-produced types map to canonical types** — no collector output is
  orphaned. The desktop collectors emit `system_configs`, `security_policies`,
  `event_logs`, `firewall_configs`, `network_configs`, `user_provisioning`; the
  AWS collector emits `s3_encryption`/`iam_policy` (legacy aliases that
  translate to `encryption_policies`/`user_provisioning`).
- **Inert mappings are intentional and documented** in the vocabulary file:
  `firewall` → HIPAA and `training_records` → GDPR do not affect scoring
  because no control in those frameworks lists the canonical type. Not gaps —
  product decisions recorded at Phase 4.

## Product Ceiling (honest, not a defect)

With only currently collector-produced evidence, the maximum achievable score
is low across all frameworks — many controls **require manual evidence**:

| Framework | Controls | Satisfiable ONLY via manual upload | Notes |
|---|---:|---:|---|
| SOC 2 | 54 | 31 | policy/audit-heavy trust criteria |
| ISO 27001 | 47 | 16 | Annex A policy/process controls |
| HIPAA | 47 | 23 | policies + procedures (164.308/310) |
| GDPR | 38 | 14 | documentation/DPIAs/notifications |

This is **expected** under the canonical coverage model: a control with no
evidence is `not_assessed`, and manual uploads are a first-class evidence
source. The upload UI (generated from the canonical SOC 2 definitions) offers
exactly the types each control requires, so every manual upload moves scoring.

Do **not** add collector "evidence" for these to inflate scores — the controls
are policy/process obligations that endpoint telemetry cannot demonstrate.
