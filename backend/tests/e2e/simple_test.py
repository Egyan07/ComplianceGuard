"""
Simple test to verify basic integration test structure.
"""

import pytest
from fastapi.testclient import TestClient

from app.main import app


def test_health_check():
    """Test basic health check endpoint."""
    client = TestClient(app)
    response = client.get("/health")
    assert response.status_code == 200
    data = response.json()
    assert data["status"] == "healthy"


def test_root_endpoint():
    """Test root endpoint."""
    client = TestClient(app)
    response = client.get("/")
    assert response.status_code == 200
    data = response.json()
    assert "ComplianceGuard" in data["message"]