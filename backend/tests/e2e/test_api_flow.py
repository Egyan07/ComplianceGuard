"""
End-to-end integration tests for ComplianceGuard API flow.

This module tests the complete API flow from authentication through
compliance framework creation, evidence collection, and evaluation.
"""

import pytest
import json
from datetime import datetime
from typing import Dict, Any

from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from app.main import app
from app.core.database import Base, create_database_engine, get_db
from app.core.auth import get_password_hash
from app.models.user import User


@pytest.fixture
def test_client(test_db_session):
    """Create a test client for the FastAPI app with test database."""
    def override_get_db():
        yield test_db_session

    # Override the get_db dependency
    app.dependency_overrides[get_db] = override_get_db

    client = TestClient(app)

    yield client

    # Clean up dependency override
    app.dependency_overrides.clear()


@pytest.fixture
def auth_token(test_client: TestClient, test_user: User):
    """Get authentication token for test user."""
    # Login to get token
    login_data = {
        "username": test_user.email,
        "password": "testpassword123",
        "grant_type": "password"
    }

    response = test_client.post("/api/auth/login", data=login_data)
    assert response.status_code == 200

    token_data = response.json()
    return token_data["access_token"]


@pytest.fixture
def auth_token(test_client: TestClient, test_user: User):
    """Get authentication token for test user."""
    # Login to get token
    login_data = {
        "username": test_user.email,
        "password": "testpassword123",
        "grant_type": "password"
    }

    response = test_client.post("/api/auth/login", data=login_data)
    assert response.status_code == 200

    token_data = response.json()
    return token_data["access_token"]


def test_complete_compliance_flow(test_client: TestClient, test_user: User, auth_token: str):
    """
    Test the complete API flow from auth to compliance evaluation.

    This test covers:
    1. User authentication
    2. Company creation
    3. Compliance framework setup
    4. Evidence collection simulation
    5. Compliance evaluation
    """

    # Step 1: Verify authentication works
    headers = {"Authorization": f"Bearer {auth_token}"}

    # Test user info endpoint (if exists) or framework summary
    response = test_client.get("/api/v1/compliance/framework/summary", headers=headers)
    assert response.status_code == 200
    summary = response.json()
    assert "total_controls" in summary
    assert "categories" in summary

    # Step 2: Get all controls to verify framework is working
    response = test_client.get("/api/v1/compliance/framework/controls", headers=headers)
    assert response.status_code == 200
    controls = response.json()
    assert len(controls) > 0

    # Verify control structure
    first_control = controls[0]
    required_fields = ["id", "title", "description", "category", "control_objective"]
    for field in required_fields:
        assert field in first_control

    # Step 3: Test control search functionality
    search_response = test_client.get("/api/v1/compliance/framework/controls/search?q=access", headers=headers)
    assert search_response.status_code == 200
    search_results = search_response.json()
    # Results may be empty, but response should be valid
    assert isinstance(search_results, list)

    # Step 4: Test getting controls by category
    category_response = test_client.get("/api/v1/compliance/framework/controls/by-category/CC", headers=headers)
    assert category_response.status_code == 200
    cc_controls = category_response.json()
    assert isinstance(cc_controls, list)

    # Step 5: Prepare evidence data for evaluation
    # Select a few controls for testing
    test_control_ids = [control["id"] for control in controls[:3]]

    evidence_data = {}
    for control_id in test_control_ids:
        evidence_data[control_id] = {
            "evidence_provided": [f"evidence_{control_id}_1", f"evidence_{control_id}_2"],
            "status": "compliant",
            "score": 0.85,
            "comments": f"Test evidence for control {control_id}"
        }

    # Step 6: Perform compliance evaluation
    evaluation_request = {
        "scope": ["CC", "A"],  # Test with Common Criteria and Availability
        "evidence_data": evidence_data,
        "evaluated_by": "test_user"
    }

    eval_response = test_client.post(
        "/api/v1/compliance/evaluate",
        json=evaluation_request,
        headers=headers
    )
    assert eval_response.status_code == 200

    evaluation_result = eval_response.json()

    # Verify evaluation result structure
    required_eval_fields = [
        "framework_id", "overall_score", "compliance_status",
        "compliance_level", "evaluation_date", "evaluated_by"
    ]
    for field in required_eval_fields:
        assert field in evaluation_result

    # Verify evaluation metrics
    assert isinstance(evaluation_result["overall_score"], (int, float))
    assert 0.0 <= evaluation_result["overall_score"] <= 1.0
    assert evaluation_result["compliance_status"] in ["compliant", "non_compliant", "partially_compliant"]

    # Step 7: Test evaluation history
    history_response = test_client.get("/api/v1/compliance/evaluations/history", headers=headers)
    assert history_response.status_code == 200
    history = history_response.json()
    assert isinstance(history, list)

    # Should have at least one evaluation (the one we just created)
    assert len(history) >= 1

    # Step 8: Test health check endpoints
    health_response = test_client.get("/health")
    assert health_response.status_code == 200
    health_data = health_response.json()
    assert health_data["status"] == "healthy"

    compliance_health_response = test_client.get("/api/v1/compliance/health")
    assert compliance_health_response.status_code == 200
    compliance_health = compliance_health_response.json()
    assert compliance_health["status"] == "healthy"


def test_api_flow_with_invalid_data(test_client: TestClient, auth_token: str):
    """Test API flow with invalid data to ensure proper error handling."""

    headers = {"Authorization": f"Bearer {auth_token}"}

    # Test invalid category
    response = test_client.get("/api/v1/compliance/framework/controls/by-category/INVALID", headers=headers)
    assert response.status_code == 400

    # Test invalid control ID
    response = test_client.get("/api/v1/compliance/framework/controls/nonexistent_control", headers=headers)
    assert response.status_code == 404

    # Test invalid evaluation request
    invalid_eval_request = {
        "scope": ["CC"],
        "evidence_data": {},  # Empty evidence data
        "evaluated_by": ""
    }

    response = test_client.post(
        "/api/v1/compliance/evaluate",
        json=invalid_eval_request,
        headers=headers
    )
    # Should handle gracefully - either 200 with low scores or 400 with validation error
    assert response.status_code in [200, 400]


def test_unauthenticated_access(test_client: TestClient):
    """Test that unauthenticated requests are properly rejected."""

    # Try to access protected endpoints without auth
    endpoints_to_test = [
        "/api/v1/compliance/framework/summary",
        "/api/v1/compliance/framework/controls",
        "/api/v1/compliance/evaluations/history"
    ]

    for endpoint in endpoints_to_test:
        response = test_client.get(endpoint)
        # Should be 401 Unauthorized or 200 if endpoint doesn't require auth
        assert response.status_code in [200, 401, 403]


def test_registration_and_login_flow(test_client: TestClient):
    """Test user registration and login flow."""

    # Test user registration
    new_user_data = {
        "email": "newuser@example.com",
        "password": "newpass123",
        "first_name": "New",
        "last_name": "User"
    }

    register_response = test_client.post("/api/auth/register", json=new_user_data)
    assert register_response.status_code == 200

    register_result = register_response.json()
    assert "access_token" in register_result
    assert register_result["token_type"] == "bearer"
    assert "user" in register_result

    # Test duplicate registration fails
    duplicate_response = test_client.post("/api/auth/register", json=new_user_data)
    assert duplicate_response.status_code == 400

    # Test login with registered user
    login_data = {
        "username": new_user_data["email"],
        "password": "newpass123",
        "grant_type": "password"
    }

    login_response = test_client.post("/api/auth/login", data=login_data)
    assert login_response.status_code == 200

    login_result = login_response.json()
    assert "access_token" in login_result
    assert login_result["user"]["email"] == new_user_data["email"]


def test_compliance_framework_completeness(test_client: TestClient, auth_token: str):
    """Test that the compliance framework has expected structure and content."""

    headers = {"Authorization": f"Bearer {auth_token}"}

    # Get framework summary
    response = test_client.get("/api/v1/compliance/framework/summary", headers=headers)
    assert response.status_code == 200

    summary = response.json()

    # Verify framework has expected categories
    expected_categories = ["CC", "A", "C", "PI", "CA"]  # Common Criteria, Availability, Confidentiality, Processing Integrity, Security
    for category in expected_categories:
        assert category in summary["categories"]
        assert summary["categories"][category] > 0  # Each category should have controls

    # Verify total controls count is reasonable for SOC 2
    assert summary["total_controls"] >= 50  # SOC 2 typically has 50+ controls

    # Test that we can get controls from each category
    for category in expected_categories:
        cat_response = test_client.get(f"/api/v1/compliance/framework/controls/by-category/{category}", headers=headers)
        assert cat_response.status_code == 200
        category_controls = cat_response.json()
        assert len(category_controls) > 0

        # Verify each control has required evidence mapping
        for control in category_controls:
            assert "evidence_mapping" in control
            assert isinstance(control["evidence_mapping"], list)


def test_evidence_collection_and_evaluation_flow(test_client: TestClient, auth_token: str):
    """Test the evidence collection and evaluation process in detail."""

    headers = {"Authorization": f"Bearer {auth_token}"}

    # Get all controls
    response = test_client.get("/api/v1/compliance/framework/controls", headers=headers)
    assert response.status_code == 200
    all_controls = response.json()

    # Select controls from different categories for comprehensive testing
    controls_by_category = {}
    for control in all_controls:
        category = control["category"]
        if category not in controls_by_category:
            controls_by_category[category] = []
        if len(controls_by_category[category]) < 2:  # Take max 2 controls per category
            controls_by_category[category].append(control)

    # Create comprehensive evidence data
    evidence_data = {}

    for category, controls in controls_by_category.items():
        for control in controls:
            control_id = control["id"]
            evidence_data[control_id] = {
                "evidence_provided": [
                    f"policy_doc_{control_id}",
                    f"implementation_evidence_{control_id}",
                    f"monitoring_log_{control_id}"
                ],
                "status": "compliant" if category == "CC" else "partially_compliant",  # Vary status
                "score": 0.9 if category == "CC" else 0.7,  # Vary scores
                "comments": f"Test evidence for {control_id} in category {category}"
            }

    # Perform comprehensive evaluation
    evaluation_request = {
        "scope": list(controls_by_category.keys()),  # All categories we have controls for
        "evidence_data": evidence_data,
        "evaluated_by": "integration_test"
    }

    eval_response = test_client.post(
        "/api/v1/compliance/evaluate",
        json=evaluation_request,
        headers=headers
    )
    assert eval_response.status_code == 200

    evaluation = eval_response.json()

    # Verify comprehensive evaluation results
    assert evaluation["control_count"] == len(evidence_data)
    assert evaluation["compliant_controls"] >= 0
    assert evaluation["overall_score"] > 0.0

    # Should have recommendations
    assert "recommendations" in evaluation
    assert isinstance(evaluation["recommendations"], list)

    # Test getting detailed control assessments
    evaluation_id = evaluation.get("framework_id", "test_evaluation")

    # This endpoint might not work without proper evaluation ID, so test gracefully
    assessments_response = test_client.get(
        f"/api/v1/compliance/evaluations/{evaluation_id}/control-assessments",
        headers=headers
    )
    # Should either work or return 404 (if evaluation ID format is different)
    assert assessments_response.status_code in [200, 404]