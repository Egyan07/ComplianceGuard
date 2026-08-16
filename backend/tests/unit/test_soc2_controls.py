"""
Test suite for SOC 2 controls framework implementation.

This module tests the SOC 2 control framework functionality including:
- Control creation and management
- Evidence mapping
- Compliance evaluation
"""

import pytest
from typing import Dict, List

from app.core.soc2_controls import SOC2Control, SOC2Framework


class TestSOC2Controls:
    """Test cases for SOC 2 control framework."""

    def test_soc2_framework_has_expected_control_count(self):
        """Test that SOC2 framework has expected number of controls."""
        framework = SOC2Framework()
        controls = framework.get_all_controls()

        # SOC 2 should have a comprehensive set of controls
        assert len(controls) >= 50, f"Expected at least 50 controls, got {len(controls)}"

    def test_control_categories_are_properly_implemented(self):
        """Test that all SOC 2 control categories are implemented."""
        framework = SOC2Framework()

        # Get controls by category
        cc_controls = framework.get_controls_by_category("CC")
        a_controls = framework.get_controls_by_category("A")
        c_controls = framework.get_controls_by_category("C")
        pi_controls = framework.get_controls_by_category("PI")
        ca_controls = framework.get_controls_by_category("CA")

        # Each category should have controls
        assert len(cc_controls) > 0, "Common Criteria (CC) controls missing"
        assert len(a_controls) > 0, "Availability (A) controls missing"
        assert len(c_controls) > 0, "Confidentiality (C) controls missing"
        assert len(pi_controls) > 0, "Processing Integrity (PI) controls missing"
        assert len(ca_controls) > 0, "Confidentiality (CA) controls missing"

    def test_control_has_evidence_mapping(self):
        """Test that controls have proper evidence mapping."""
        framework = SOC2Framework()
        controls = framework.get_all_controls()

        # Check that controls have evidence mappings
        for control in controls[:5]:  # Test first 5 controls
            assert hasattr(control, 'evidence_mapping'), f"Control {control.id} missing evidence mapping"
            assert control.evidence_mapping is not None, f"Control {control.id} has null evidence mapping"
            assert len(control.evidence_mapping) > 0, f"Control {control.id} has empty evidence mapping"

    def test_control_structure_is_valid(self):
        """Test that SOC 2 controls have proper structure."""
        framework = SOC2Framework()
        controls = framework.get_all_controls()

        for control in controls[:3]:  # Test first 3 controls
            assert hasattr(control, 'id'), "Control missing ID"
            assert hasattr(control, 'title'), "Control missing title"
            assert hasattr(control, 'description'), "Control missing description"
            assert hasattr(control, 'category'), "Control missing category"
            assert hasattr(control, 'evidence_mapping'), "Control missing evidence mapping"

            assert control.id.startswith('CC') or control.id.startswith('A') or \
                   control.id.startswith('C') or control.id.startswith('PI') or \
                   control.id.startswith('CA'), f"Invalid control ID format: {control.id}"


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
