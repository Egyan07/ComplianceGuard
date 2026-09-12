"""
Regression tests for the canonical shared-frameworks path resolution.

The SSOT loaders originally resolved shared/frameworks/ with a fixed
three-parent walk from backend/app/core/. That is correct only for the host
checkout: the Docker image places the application at /app/app/core with the
shared directory at /app/shared, so the fixed walk landed at /shared/frameworks
and the containerized backend crashed on boot (caught by the functional smoke
test).

These tests pin the resolver's contract:

- it finds the REAL canonical directory in the host checkout;
- it is depth-independent: synthetic layouts mimicking the Docker image
  (2 levels) and the host checkout (3 levels) both resolve — no fixed-walk
  assumption;
- a layout with no canonical directory raises FileNotFoundError with an
  actionable message (no silent fallback to a second framework source);
- acceptance is gated on the canonical marker file, so an empty
  shared/frameworks directory cannot satisfy the resolver;
- the loaders consume the resolver and no longer walk a fixed depth.
"""

import pytest
from pathlib import Path

from app.core.shared_frameworks import find_shared_frameworks_dir, SHARED_FRAMEWORKS_DIR

REPO_ROOT = Path(__file__).resolve().parents[3]
MARKER = "evidence-vocabulary.json"


def test_resolves_real_canonical_directory_host_layout():
    """In the host checkout the resolver must land on <repo>/shared/frameworks."""
    assert Path(SHARED_FRAMEWORKS_DIR) == REPO_ROOT / "shared" / "frameworks"
    assert (Path(SHARED_FRAMEWORKS_DIR) / MARKER).is_file()
    for name in ("soc2_controls.yaml", "iso27001_controls.yaml",
                 "gdpr_controls.yaml", "hipaa_controls.yaml"):
        assert (Path(SHARED_FRAMEWORKS_DIR) / name).is_file(), (
            f"canonical framework file {name} missing from resolved directory"
        )


@pytest.mark.parametrize("depth", [2, 3], ids=["docker-layout", "host-layout"])
def test_finds_canonical_dir_regardless_of_layout_depth(tmp_path, depth):
    """Synthetic layouts mirroring the two real deployments must both resolve.

    docker: <root>/app/app/core          (core is 2 dirs below root)
    host:   <root>/backend/app/core      (core is 3 dirs below root)
    """
    shared = tmp_path / "shared" / "frameworks"
    shared.mkdir(parents=True)
    (shared / MARKER).write_text("{}", encoding="utf-8")

    app_core = tmp_path / "srv"          # extra level so the walk is never trivial
    if depth == 3:
        app_core = app_core / "backend"
    app_core = app_core / "app" / "core"
    app_core.mkdir(parents=True)

    assert Path(find_shared_frameworks_dir(str(app_core))) == shared


def test_empty_shared_frameworks_dir_is_rejected(tmp_path):
    """A directory named shared/frameworks without the marker file must NOT be
    accepted — acceptance is gated on the canonical data being present."""
    (tmp_path / "shared" / "frameworks").mkdir(parents=True)
    app_core = tmp_path / "backend" / "app" / "core"
    app_core.mkdir(parents=True)
    with pytest.raises(FileNotFoundError):
        find_shared_frameworks_dir(str(app_core))


def test_missing_canonical_dir_raises_with_actionable_message(tmp_path):
    app_core = tmp_path / "app" / "core"
    app_core.mkdir(parents=True)
    with pytest.raises(FileNotFoundError) as excinfo:
        find_shared_frameworks_dir(str(app_core))
    message = str(excinfo.value)
    assert "shared/frameworks" in message
    assert MARKER in message


def test_loaders_use_resolver_not_fixed_depth_walk():
    """The loaders must resolve via the upward-search resolver, not a fixed
    three-parent walk (the root cause of the Docker boot crash)."""
    loaders = ("soc2_controls.py", "gdpr_controls.py", "hipaa_controls.py",
               "iso27001_controls.py", "canonical_evidence.py")
    for loader in loaders:
        src = (REPO_ROOT / "backend" / "app" / "core" / loader).read_text(encoding="utf-8")
        assert "SHARED_FRAMEWORKS_DIR" in src, f"{loader} must use the resolver"
        assert '"..", "..", ".."' not in src, (
            f"{loader} still walks a fixed three-parent path (Docker-unsafe)"
        )
