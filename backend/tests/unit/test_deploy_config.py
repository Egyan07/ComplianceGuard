"""Phase 11 (F+G): deployment configuration regression tests.

Guards the invariant: the DEFAULT deployment must not claim a 5/minute login
limit while actually providing N independent per-worker buckets. If WORKERS>1
is shipped without a shared rate-limit backend, CI fails loudly here.
"""
import os
import re
import subprocess
import sys
from pathlib import Path

BACKEND_DIR = Path(__file__).resolve().parents[2]
REPO_ROOT = BACKEND_DIR.parent


def _read(rel_path):
    return (REPO_ROOT / rel_path).read_text(encoding="utf-8")


class TestWorkerRateLimitConsistency:
    def test_dockerfile_defaults_to_one_worker(self):
        """The shipped image must not multiply the in-memory rate limit."""
        dockerfile = _read("backend/Dockerfile")
        cmd_line = [line for line in dockerfile.splitlines() if "uvicorn" in line and "--workers" in line]
        assert cmd_line, "Dockerfile must define the uvicorn worker count"
        assert '${WORKERS:-1}' in cmd_line[0], \
            f"Dockerfile worker default drifted: {cmd_line[0]}"

    def test_docker_compose_passes_worker_default(self):
        compose = _read("docker-compose.yml")
        assert "WORKERS: ${WORKERS:-1}" in compose

    def test_rate_limit_module_default_matches_deployment(self):
        """rate_limit.py must read the SAME WORKERS env the container uses."""
        result = subprocess.run(
            [sys.executable, "-c", (
                "import os; os.environ['WORKERS']='7'; "
                "import app.core.rate_limit as rl; print(rl._WORKERS)"
            )],
            cwd=BACKEND_DIR, capture_output=True, text=True, check=True,
        )
        assert result.stdout.strip() == "7"

    def test_workers_gt_one_without_shared_storage_warns(self):
        """Scaling out without a shared backend must be loud, not silent."""
        result = subprocess.run(
            [sys.executable, "-c", (
                "import logging, os; "
                "os.environ['WORKERS']='4'; os.environ.pop('RATELIMIT_STORAGE_URI', None); "
                "logging.basicConfig(level=logging.WARNING, format='%(message)s'); "
                "import app.core.rate_limit"  # noqa
            )],
            cwd=BACKEND_DIR, capture_output=True, text=True, check=True,
        )
        combined = result.stdout + result.stderr
        assert "Rate limiter is using in-memory storage but WORKERS=4" in combined

    def test_warning_is_conditional_on_missing_shared_storage(self):
        """The in-memory warning must only fire when no shared backend is set;
        with RATELIMIT_STORAGE_URI configured the limit holds across workers.

        (A behavioral test can't construct the redis-backed limiter — the redis
        package is intentionally not a base dependency, and main.py already
        warns when the URI is set without the package installed.)
        """
        src = (BACKEND_DIR / "app" / "core" / "rate_limit.py").read_text(encoding="utf-8")
        assert "if _WORKERS > 1 and not _STORAGE_URI:" in src
        assert "_limiter_kwargs[\"storage_uri\"] = _STORAGE_URI" in src


class TestPostgresBinding:
    def test_postgres_is_bound_to_localhost_only(self):
        compose = _read("docker-compose.yml")
        assert "127.0.0.1:5432:5432" in compose
        # The host-wide binding must be gone.
        assert not re.search(r'^\s*-\s*"5432:5432"\s*$', compose, re.MULTILINE)

    def test_backend_still_reaches_db_over_compose_network(self):
        compose = _read("docker-compose.yml")
        # Backend connects via the service name, not the published port.
        assert "postgresql://${DB_USER}:${DB_PASSWORD}@db:5432/complianceguard" in compose
