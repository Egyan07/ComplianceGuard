"""
Verify the cross-repo constants single source of truth.

All shared values (VERSION, MACHINE_LIMITS, FEATURE_GATES, tier/level
enumerations) live in one JSON file at shared/constants.json. The Python and
Electron mirrors load it at runtime; the React mirror imports it at build time.

These tests assert the mirrors actually load the JSON (so a value change in
shared/constants.json is automatically reflected everywhere), and that the
TypeScript file imports the JSON instead of hardcoding values.

Historically these values were hand-mirrored across three module systems and
drift silently broke feature gating and cloud-sync caps — the exact class of
bug that let enterprise features fall through to free. The JSON removes the
mirroring entirely.

Fix on failure: the values are defined once in shared/constants.json. If a
mirror isn't loading it, fix the loader — do not copy values into the mirror.
"""

import json
import shutil
import subprocess
from pathlib import Path

import pytest

from app.core import constants as py_constants

PY_REL = "backend/app/core/constants.py"
TS_REL = "frontend/src/constants.ts"
JS_REL = "electron/licensing/tier-constants.js"
JSON_REL = "shared/constants.json"


def _repo_root() -> Path:
    """Walk up from this file to find the repo root (contains package.json)."""
    p = Path(__file__).resolve()
    for parent in p.parents:
        if (parent / "package.json").exists():
            return parent
    raise RuntimeError("Could not locate repo root")


def _shared_json() -> dict:
    return json.loads((_repo_root() / JSON_REL).read_text())


def test_python_mirror_matches_shared_json():
    """Python constants must load every shared value from the JSON."""
    shared = _shared_json()
    assert py_constants.VERSION == shared["VERSION"]
    assert list(py_constants.VALID_LICENSE_TIERS) == shared["VALID_LICENSE_TIERS"]
    assert list(py_constants.VALID_COMPLIANCE_LEVELS) == shared["VALID_COMPLIANCE_LEVELS"]
    assert py_constants.MACHINE_LIMITS == shared["MACHINE_LIMITS"]
    assert py_constants.FEATURE_GATES == shared["FEATURE_GATES"]


def test_electron_mirror_matches_shared_json():
    """Electron tier-constants must load every shared value from the JSON."""
    if shutil.which("node") is None:
        pytest.skip("node not available")
    shared = _shared_json()
    js = subprocess.run(
        ["node", "-e", "process.stdout.write(JSON.stringify(require('./electron/licensing/tier-constants')))"],
        cwd=str(_repo_root()),
        capture_output=True,
        text=True,
        timeout=30,
    )
    assert js.returncode == 0, js.stderr
    loaded = json.loads(js.stdout)
    assert loaded["VERSION"] == shared["VERSION"]
    assert loaded["VALID_LICENSE_TIERS"] == shared["VALID_LICENSE_TIERS"]
    assert loaded["VALID_COMPLIANCE_LEVELS"] == shared["VALID_COMPLIANCE_LEVELS"]
    assert loaded["MACHINE_LIMITS"] == shared["MACHINE_LIMITS"]
    assert loaded["FEATURE_GATES"] == shared["FEATURE_GATES"]


def test_ts_mirror_imports_shared_json():
    """The React mirror must import shared/constants.json, not hardcode values."""
    ts = (_repo_root() / TS_REL).read_text()
    assert "../../shared/constants.json" in ts, (
        "frontend/src/constants.ts must import values from shared/constants.json "
        "instead of hardcoding them"
    )
