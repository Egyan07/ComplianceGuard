"""
Cross-repo single source of truth for versioning, machine limits, tier gates,
and enumerations — Python side.

The values themselves live in a single shared JSON file at the repo root
(``shared/constants.json``) and are loaded at import time, so the Python,
Electron (CJS), and React (ESM) mirrors can never drift.

If VERSION changes, also bump:
  - package.json (repo root)
  - frontend/package.json
"""

import json
from pathlib import Path

# Resolution order covers the three layouts the app runs in:
#   1. Source checkout / tests:  <repo>/shared/constants.json
#   2. Docker image (prod):      /app/shared/constants.json
#   3. Docker dev bind mount:    /app/shared/constants.json (mounted from <repo>/shared)
_CONSTANTS_PATH = None
for _candidate in (
    Path(__file__).resolve().parents[3] / "shared" / "constants.json",
    Path(__file__).resolve().parents[2] / "shared" / "constants.json",
):
    if _candidate.is_file():
        _CONSTANTS_PATH = _candidate
        break

if _CONSTANTS_PATH is None:
    raise FileNotFoundError(
        f"Could not locate shared/constants.json from {Path(__file__).resolve()}"
    )

with _CONSTANTS_PATH.open("r", encoding="utf-8") as _fh:
    _CONSTANTS = json.load(_fh)

VERSION: str = _CONSTANTS["VERSION"]
VALID_LICENSE_TIERS: tuple = tuple(_CONSTANTS["VALID_LICENSE_TIERS"])
VALID_COMPLIANCE_LEVELS: tuple = tuple(_CONSTANTS["VALID_COMPLIANCE_LEVELS"])

# Per-tier machine cap for cloud sync. ``None`` means unlimited.
MACHINE_LIMITS: dict = _CONSTANTS["MACHINE_LIMITS"]

# Feature gating — True means the tier can use the feature.
FEATURE_GATES: dict = _CONSTANTS["FEATURE_GATES"]
