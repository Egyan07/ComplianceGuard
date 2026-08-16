#!/usr/bin/env python3
"""Hygiene gate (Phase 8): every variable in the .env examples must be referenced.

Checks that each ``VAR=`` line in ``.env.example`` and
``.env.enterprise.example`` is actually read somewhere in the repository, so
phantom/obsolete environment variables cannot silently return.

Reference sources checked:

- backend ``Settings`` fields (pydantic-settings reads them by env name)
- direct ``os.environ`` / ``os.getenv`` reads in ``backend/app``
- ``import.meta.env.VITE_*`` references in ``frontend/src``
- ``${VAR}`` interpolations in ``docker-compose*.yml``
- ``${VAR}`` / ``$VAR`` references in ``scripts/*.sh``

Exit code 0 = every example variable is referenced; 1 = at least one phantom
variable was found.

Usage (from anywhere):

    python scripts/check-env-example.py
    python scripts/check-env-example.py --verbose
"""

from __future__ import annotations

import ast
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
EXAMPLES = [
    ROOT / ".env.example",
    ROOT / ".env.enterprise.example",
]

VAR_RE = re.compile(r"^([A-Z][A-Z0-9_]*)\s*=", re.M)
# os.environ.get("X") / os.getenv("X") / os.environ.pop("X") / setdefault("X", ...)
ENV_READ_RE = re.compile(
    r"""os\.environ\.(?:get|pop|setdefault)\(\s*["']([A-Z][A-Z0-9_]*)["']"""
    r"""|os\.getenv\(\s*["']([A-Z][A-Z0-9_]*)["']"""
)
IMPORT_META_RE = re.compile(r"import\.meta\.env\.([A-Z][A-Z0-9_]*)")
COMPOSE_RE = re.compile(r"\$\{([A-Z][A-Z0-9_]*)")


def _shell_envs(text: str) -> set[str]:
    """${VAR} and $VAR (quoted or bare) references in shell scripts."""
    found: set[str] = set()
    # ${VAR} / ${VAR:-default} / ${VAR:?msg}
    found |= set(re.findall(r"\$\{([A-Z][A-Z0-9_]*)\b", text))
    # "$VAR"
    found |= set(re.findall(r'"\$([A-Z][A-Z0-9_]*)', text))
    # bare $VAR (not ${...}, which is already handled)
    found |= set(re.findall(r"(?<![$A-Z0-9_])\$([A-Z][A-Z0-9_]*)\b", text))
    return found


def example_vars(path: Path) -> set[str]:
    return set(VAR_RE.findall(path.read_text(encoding="utf-8", errors="ignore")))


def backend_settings_fields() -> set[str]:
    """Settings field names (uppercased) parsed statically from config.py.

    AST parsing (rather than importing) keeps this dependency-free and immune
    to the local environment — importing would instantiate Settings(), which
    loads .env and can fail on a developer machine's local values.
    """
    config_path = ROOT / "backend" / "app" / "core" / "config.py"
    try:
        tree = ast.parse(config_path.read_text(encoding="utf-8"))
    except (OSError, SyntaxError):
        return set()
    for node in tree.body:
        if isinstance(node, ast.ClassDef) and node.name == "Settings":
            return {
                item.target.id.upper()
                for item in node.body
                if isinstance(item, ast.AnnAssign)
                and isinstance(item.target, ast.Name)
            }
    return set()


def main() -> int:
    verbose = "--verbose" in sys.argv
    referenced: set[str] = set()

    fields = backend_settings_fields()
    referenced |= fields
    if verbose:
        print(f"reference: backend Settings fields ({len(fields)})")

    for p in (ROOT / "backend" / "app").rglob("*.py"):
        text = p.read_text(encoding="utf-8", errors="ignore")
        found = {m for pair in ENV_READ_RE.findall(text) for m in pair if m}
        if found and verbose:
            print(f"reference: os.environ/os.getenv in {p.relative_to(ROOT)}")
        referenced |= found

    for p in (ROOT / "frontend" / "src").rglob("*"):
        if p.is_file() and p.suffix in (".ts", ".tsx", ".js", ".jsx"):
            found = set(IMPORT_META_RE.findall(
                p.read_text(encoding="utf-8", errors="ignore")))
            if found and verbose:
                print(f"reference: import.meta.env in {p.relative_to(ROOT)}")
            referenced |= found

    for p in ROOT.glob("docker-compose*.yml"):
        found = set(COMPOSE_RE.findall(
            p.read_text(encoding="utf-8", errors="ignore")))
        if found and verbose:
            print(f"reference: docker-compose interpolation in {p.name}")
        referenced |= found

    for p in (ROOT / "scripts").glob("*.sh"):
        found = _shell_envs(p.read_text(encoding="utf-8", errors="ignore"))
        if found and verbose:
            print(f"reference: shell interpolation in {p.name}")
        referenced |= found

    # nginx.conf uses nginx built-in $vars; deliberately not scanned.

    problems = 0
    for example in EXAMPLES:
        if not example.exists():
            continue
        for var in sorted(example_vars(example)):
            if var not in referenced:
                problems += 1
                print(f"[FAIL] {example.name}: {var} is not referenced "
                      "anywhere in the repository")
        if verbose:
            print(f"checked {example.name} ({len(example_vars(example))} vars)")

    if problems:
        print(f"\n{problems} phantom environment variable(s) found. "
              "Remove them from the .env example (or wire them into the code "
              "so they actually do something) before merging.")
        return 1

    print("OK: every .env.example / .env.enterprise.example variable is "
          "referenced somewhere in the repository.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
