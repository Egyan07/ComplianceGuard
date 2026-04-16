"""Tests that CORS middleware uses settings.cors_origins, not a hardcoded list."""
import pytest
from fastapi.testclient import TestClient


def test_cors_blocks_unknown_origin():
    """A request from an origin not in settings must not get the allow header."""
    from app.main import app
    client = TestClient(app)
    resp = client.options(
        "/health",
        headers={
            "Origin": "https://attacker.com",
            "Access-Control-Request-Method": "GET",
        },
    )
    assert resp.headers.get("access-control-allow-origin") != "https://attacker.com"


def test_cors_allows_localhost_5173():
    """A request from the default dev origin must receive the allow header."""
    from app.main import app
    client = TestClient(app)
    resp = client.options(
        "/health",
        headers={
            "Origin": "http://localhost:5173",
            "Access-Control-Request-Method": "GET",
        },
    )
    assert resp.headers.get("access-control-allow-origin") == "http://localhost:5173"
