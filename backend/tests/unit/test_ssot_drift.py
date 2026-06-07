"""
Verify that the three cross-repo SSOT constant files agree.

The constants are hand-mirrored across three module systems:
  - backend/app/core/constants.py   (Python)
  - frontend/src/constants.ts        (TypeScript)
  - electron/licensing/tier-constants.js (CommonJS)

If any of these tests fail it means someone changed a value in one file but not
the others. Historically only VERSION was checked here — but FEATURE_GATES and
MACHINE_LIMITS are what gate paid features and cloud-sync caps, so drift in them
is a silent monetization/security-boundary bug. All three are now asserted.

Fix on failure: make the named value identical across all three files.
"""

import re
from pathlib import Path

PY_REL = "backend/app/core/constants.py"
TS_REL = "frontend/src/constants.ts"
JS_REL = "electron/licensing/tier-constants.js"


def _repo_root() -> Path:
    """Walk up from this file to find the repo root (contains package.json)."""
    p = Path(__file__).resolve()
    for parent in p.parents:
        if (parent / "package.json").exists():
            return parent
    raise RuntimeError("Could not locate repo root")


def _read(rel: str) -> str:
    return (_repo_root() / rel).read_text()


def _extract_version(text: str, pattern: str) -> str:
    m = re.search(pattern, text)
    if not m:
        raise ValueError(f"VERSION not found with pattern {pattern!r}")
    return m.group(1)


# A feature-gate line looks like (modulo quoting / bool casing) across all three
# languages:  name: { free: <bool>, pro: <bool>, enterprise: <bool> }
_GATE_RE = re.compile(
    r'["\']?(\w+)["\']?\s*:\s*\{\s*'
    r'["\']?free["\']?\s*:\s*(true|false)\s*,\s*'
    r'["\']?pro["\']?\s*:\s*(true|false)\s*,\s*'
    r'["\']?enterprise["\']?\s*:\s*(true|false)\s*,?\s*\}',
    re.IGNORECASE,
)


def _parse_feature_gates(text: str) -> dict:
    """Return {feature: (free, pro, enterprise)} as bools, language-agnostic."""
    gates = {}
    for name, free, pro, ent in _GATE_RE.findall(text):
        gates[name] = tuple(v.lower() == "true" for v in (free, pro, ent))
    if not gates:
        raise ValueError("No FEATURE_GATES parsed")
    return gates


def _parse_machine_limits(text: str) -> dict:
    """Return {tier: int|None}. Isolates the MACHINE_LIMITS block first so the
    free/pro keys inside FEATURE_GATES are not picked up."""
    block_m = re.search(r"MACHINE_LIMITS[^{]*\{([^}]*)\}", text)
    if not block_m:
        raise ValueError("MACHINE_LIMITS block not found")
    block = block_m.group(1)
    limits = {}
    for tier in ("free", "pro", "enterprise"):
        m = re.search(rf'["\']?{tier}["\']?\s*:\s*(\d+|null|None)', block, re.IGNORECASE)
        if not m:
            raise ValueError(f"MACHINE_LIMITS missing tier {tier!r}")
        val = m.group(1)
        limits[tier] = None if val.lower() in ("null", "none") else int(val)
    return limits


def test_version_ssot_consistent():
    """Python, TypeScript, and CommonJS SSOT files must all carry the same VERSION."""
    py_ver = _extract_version(_read(PY_REL), r'VERSION\s*=\s*["\']([^"\']+)["\']')
    ts_ver = _extract_version(_read(TS_REL), r"export const VERSION\s*=\s*['\"]([^'\"]+)['\"]")
    js_ver = _extract_version(_read(JS_REL), r"VERSION:\s*['\"]([^'\"]+)['\"]")

    assert py_ver == ts_ver, (
        f"VERSION mismatch — Python: {py_ver!r}, TypeScript: {ts_ver!r}. "
        "Update frontend/src/constants.ts."
    )
    assert py_ver == js_ver, (
        f"VERSION mismatch — Python: {py_ver!r}, Electron JS: {js_ver!r}. "
        "Update electron/licensing/tier-constants.js."
    )


def test_feature_gates_ssot_consistent():
    """FEATURE_GATES must be byte-for-byte equivalent across all three files.

    A drift here means a paid/enterprise feature is gated differently per
    surface — the exact class of bug that let enterprise fall through to free.
    """
    py = _parse_feature_gates(_read(PY_REL))
    ts = _parse_feature_gates(_read(TS_REL))
    js = _parse_feature_gates(_read(JS_REL))

    assert py == ts, (
        f"FEATURE_GATES mismatch (Python vs TypeScript). "
        f"Only in Python: {set(py) - set(ts)}; only in TS: {set(ts) - set(py)}; "
        f"differing: {{k: (py[k], ts[k]) for k in py if k in ts and py[k] != ts[k]}}. "
        "Update frontend/src/constants.ts."
    )
    assert py == js, (
        f"FEATURE_GATES mismatch (Python vs Electron JS). "
        f"Only in Python: {set(py) - set(js)}; only in JS: {set(js) - set(py)}; "
        f"differing: {{k: (py[k], js[k]) for k in py if k in js and py[k] != js[k]}}. "
        "Update electron/licensing/tier-constants.js."
    )


def test_machine_limits_ssot_consistent():
    """MACHINE_LIMITS (per-tier cloud-sync machine caps) must match across files."""
    py = _parse_machine_limits(_read(PY_REL))
    ts = _parse_machine_limits(_read(TS_REL))
    js = _parse_machine_limits(_read(JS_REL))

    assert py == ts, f"MACHINE_LIMITS mismatch — Python: {py}, TypeScript: {ts}. Update frontend/src/constants.ts."
    assert py == js, f"MACHINE_LIMITS mismatch — Python: {py}, Electron JS: {js}. Update electron/licensing/tier-constants.js."
