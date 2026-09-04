"""
CG-M5 regression: the ALLOWED_HOSTS configuration must be ENFORCED when set.

Before this fix the setting existed in app.core.config but no middleware
consumed it. app.main now adds Starlette TrustedHostMiddleware when
ALLOWED_HOSTS is explicitly set; when unset nothing changes (proxy handles it),
so default deployments keep working.

Host behavior is verified end-to-end in a subprocess because middleware is
registered at app.main import time (env must be set before import).
"""

import os
import subprocess
import sys
import textwrap

from app.main import parse_allowed_hosts


class TestParseAllowedHosts:
    def test_none_when_env_unset(self):
        assert parse_allowed_hosts(None) is None
        assert parse_allowed_hosts("") is None
        assert parse_allowed_hosts("   ") is None

    def test_comma_list(self):
        assert parse_allowed_hosts("a.example, b.example") == ["a.example", "b.example"]

    def test_json_array(self):
        assert parse_allowed_hosts('["a.example", "b.example"]') == ["a.example", "b.example"]

    def test_single_host(self):
        assert parse_allowed_hosts("api.example.com") == ["api.example.com"]


def _run_app(env_hosts, host_header):
    """Boot app.main with ALLOWED_HOSTS=env_hosts and probe GET / with the Host header."""
    script = textwrap.dedent(
        """
        import os, json
        from fastapi.testclient import TestClient
        import app.main as m
        client = TestClient(m.app)
        r = client.get("/", headers={"host": %r})
        print(r.status_code)
        """
    ) % host_header
    env = dict(os.environ)
    if env_hosts is None:
        env.pop("ALLOWED_HOSTS", None)
    else:
        env["ALLOWED_HOSTS"] = env_hosts
    proc = subprocess.run(
        [sys.executable, "-c", script],
        capture_output=True,
        text=True,
        timeout=120,
        env=env,
    )
    assert proc.returncode == 0, f"subprocess failed: {proc.stderr}"
    return int(proc.stdout.strip().splitlines()[-1])


class TestHostHeaderEnforcement:
    def test_unconfigured_accepts_any_host(self):
        # Middleware absent by default — no behavior change for existing
        # deployments (nginx constrains Host at the proxy).
        assert _run_app(None, "evil.example") == 200

    def test_configured_rejects_foreign_host(self):
        # TestClient's default host is 'testserver'; only evil.example is allowed.
        assert _run_app('["evil.example"]', "testserver") == 400

    def test_configured_accepts_allowed_host(self):
        # JSON array form — pydantic-settings requires it for List[str] env vars.
        assert _run_app('["evil.example"]', "evil.example") == 200
