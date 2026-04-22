"""
Cross-repo single source of truth for versioning, machine limits, tier gates,
and enumerations — Python side.

Mirrored verbatim on the JS side in:
  - electron/licensing/tier-constants.js  (desktop / Electron main process)
  - frontend/src/constants.ts              (React / Vite bundle)

Any edit here MUST also be made in both of the files above, or the backend
will drift from the desktop app and/or the web frontend. Values are
duplicated instead of imported because Python and Node live in different
module systems and we don't want the build to depend on a JSON shim.

Checklist for an edit:
  1. Update this file.
  2. Update electron/licensing/tier-constants.js to match.
  3. Update frontend/src/constants.ts to match.
  4. If VERSION changed, bump:
      - package.json (repo root)
      - frontend/package.json
"""

VERSION = "3.0.0"

VALID_LICENSE_TIERS = ("free", "pro", "enterprise")
VALID_COMPLIANCE_LEVELS = ("compliant", "at_risk", "critical")

# Per-tier machine cap for cloud sync. ``None`` means unlimited.
MACHINE_LIMITS = {
    "free": 1,
    "pro": 10,
    "enterprise": None,
}

# Feature gating — True means the tier can use the feature.
FEATURE_GATES = {
    "all_controls":        {"free": False, "pro": True, "enterprise": True},
    "per_control_scoring": {"free": False, "pro": True, "enterprise": True},
    "remediation":         {"free": False, "pro": True, "enterprise": True},
    "pdf_reports":         {"free": False, "pro": True, "enterprise": True},
    "evidence_upload":     {"free": False, "pro": True, "enterprise": True},
    "evaluation_history":  {"free": False, "pro": True, "enterprise": True},
}
