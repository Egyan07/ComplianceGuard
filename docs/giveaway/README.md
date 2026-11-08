# 221 controls to 13 evidence types — giveaway bundle

Generated 2026-11-09 from `C:\My Projects\Projects\complianceguard` at 4.2.4. Every number below was
computed from the framework files and the shared vocabulary, not copied from a post.

## Counts

| Measure | Value |
|---|---|
| Frameworks | 4 (SOC 2 Type II, ISO/IEC 27001:2022, HIPAA Security Rule, GDPR) |
| Controls | 221 (43 + 93 + 47 + 38) |
| Canonical evidence types | 13, and all 13 are used by at least one control |
| Control-to-evidence mappings | 362 |
| Evidence slots reachable by a collector | 92 (event logs 13, firewall 3, network 8, security policies 21, system configs 32, user provisioning 15) |
| Slots only a person can produce | 270 |
| Most reused type | `policy_document`, in 168 of 362 slots |
| Rarest | `access_logs`, in 1 slot |
| Most types on one control | 7 |
| Controls with no required evidence | 0 |

Framework split by scoring mode, as stored in the files:

| Framework | automatable | hybrid | manual_upload | no mode field |
|---|---|---|---|---|
| SOC 2 | 3 | 9 | 31 | 0 |
| ISO 27001 | 4 | 21 | 68 | 0 |
| GDPR | 1 | 3 | 34 | 0 |
| HIPAA | — | — | — | 47 |

The HIPAA file carries no `assessment_mode` on any of its 47 controls. That is a real gap in the data,
not a decision to describe in public copy, and it should be filled before anyone claims all 221
controls have a mode.

## Files

- `control_evidence_map.csv` — one row per control per evidence type, 362 rows plus a header. Columns:
  framework, control_id, control_title, category, risk_level, assessment_mode, evidence_type. This is
  the file that answers "what evidence does this control need" and the one worth pivoting.
- `controls_summary.csv` — one row per control, 221 rows plus a header, with `evidence_type_count` and
  the required evidence joined by pipes. Easier to read, less useful to filter.

## Regenerating

The generator reads `shared/frameworks/{soc2,iso27001,hipaa,gdpr}_controls.yaml` and
`shared/frameworks/evidence-vocabulary.json`. NIST CSF 2.0 exists in the repo at 43 controls but is not
mapped into the product yet, so it is deliberately excluded from the 221.

## Publishing

Two files and a link. Host them somewhere the audience can open without a login, a gist or a `docs/`
folder in the repo both work. The post carries no link, the first comment does.
