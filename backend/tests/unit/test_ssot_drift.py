"""
Verify that the three cross-repo SSOT constant files agree on VERSION.

If this test fails it means someone bumped the version in one file but not the
others. Fix: update all three files (backend/app/core/constants.py,
frontend/src/constants.ts, electron/licensing/tier-constants.js) to the same
VERSION string.
"""

import re
from pathlib import Path


def _repo_root() -> Path:
    """Walk up from this file to find the repo root (contains package.json)."""
    p = Path(__file__).resolve()
    for parent in p.parents:
        if (parent / "package.json").exists():
            return parent
    raise RuntimeError("Could not locate repo root")


def _extract_version(text: str, pattern: str) -> str:
    m = re.search(pattern, text)
    if not m:
        raise ValueError(f"VERSION not found with pattern {pattern!r}")
    return m.group(1)


def test_version_ssot_consistent():
    """Python, TypeScript, and CommonJS SSOT files must all carry the same VERSION."""
    root = _repo_root()

    py_src = (root / "backend" / "app" / "core" / "constants.py").read_text()
    ts_src = (root / "frontend" / "src" / "constants.ts").read_text()
    js_src = (root / "electron" / "licensing" / "tier-constants.js").read_text()

    py_ver = _extract_version(py_src, r'VERSION\s*=\s*["\']([^"\']+)["\']')
    ts_ver = _extract_version(ts_src, r"export const VERSION\s*=\s*['\"]([^'\"]+)['\"]")
    js_ver = _extract_version(js_src, r"VERSION:\s*['\"]([^'\"]+)['\"]")

    assert py_ver == ts_ver, (
        f"VERSION mismatch — Python: {py_ver!r}, TypeScript: {ts_ver!r}. "
        "Update frontend/src/constants.ts."
    )
    assert py_ver == js_ver, (
        f"VERSION mismatch — Python: {py_ver!r}, Electron JS: {js_ver!r}. "
        "Update electron/licensing/tier-constants.js."
    )
