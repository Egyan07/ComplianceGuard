"""Phase 11 (H): application-level security headers regression tests.

The API must set basic browser-security headers itself (defense in depth),
not depend entirely on nginx.
"""
import pytest
from fastapi.testclient import TestClient

from app.main import app


@pytest.fixture
def client():
    return TestClient(app)


class TestSecurityHeaders:
    def test_api_responses_carry_security_headers(self, client):
        resp = client.get("/health")
        assert resp.status_code == 200
        assert resp.headers.get("x-content-type-options") == "nosniff"
        assert resp.headers.get("x-frame-options") == "DENY"
        assert resp.headers.get("referrer-policy") == "strict-origin-when-cross-origin"

    def test_error_responses_carry_security_headers(self, client):
        # 404 through the middleware too — headers on every response, not just 2xx.
        resp = client.get("/api/v1/does-not-exist")
        assert resp.status_code == 404
        assert resp.headers.get("x-content-type-options") == "nosniff"
        assert resp.headers.get("x-frame-options") == "DENY"
        assert resp.headers.get("referrer-policy") == "strict-origin-when-cross-origin"

    def test_authenticated_api_response_carries_headers(self, client):
        # Unauthenticated is fine — we only assert the middleware runs on a
        # real API route (401 is expected for no token).
        resp = client.get("/api/v1/evidence/items")
        assert resp.status_code == 401
        assert resp.headers.get("x-content-type-options") == "nosniff"
