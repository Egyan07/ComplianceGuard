"""
Test suite for SOC 2 controls framework implementation.

This module tests the SOC 2 control framework functionality including:
- Control creation and management
- Evidence mapping
- Compliance evaluation

The loader reads the canonical definition from shared/frameworks/
(single source of truth), so these tests lock the REAL 2017 Trust Services
Criteria structure: 43 criteria, no fabricated categories (the old suite
asserted an invented "CA" category and >= 50 controls).
"""

import pytest

from app.core.soc2_controls import SOC2Framework


class TestSOC2Controls:
    """Test cases for SOC 2 control framework."""

    def test_soc2_framework_has_expected_control_count(self):
        """Test that SOC2 framework has the real 2017 TSC criterion count."""
        framework = SOC2Framework()
        controls = framework.get_all_controls()

        # 2017 TSC: 33 Common Criteria + 3 Availability + 2 Confidentiality
        # + 5 Processing Integrity = 43.
        assert len(controls) == 43, f"Expected 43 criteria, got {len(controls)}"

    def test_control_categories_are_properly_implemented(self):
        """Test that all real TSC categories are implemented — and that the
        fabricated 'CA' category is gone."""
        framework = SOC2Framework()

        cc_controls = framework.get_controls_by_category("CC")
        a_controls = framework.get_controls_by_category("A")
        c_controls = framework.get_controls_by_category("C")
        pi_controls = framework.get_controls_by_category("PI")

        # Real category sizes (supplement criteria per category).
        assert len(cc_controls) == 33, "Common Criteria must have exactly 33 criteria"
        assert len(a_controls) == 3, "Availability must have exactly 3 criteria (A1.1-A1.3)"
        assert len(c_controls) == 2, "Confidentiality must have exactly 2 criteria (C1.1-C1.2)"
        assert len(pi_controls) == 5, "Processing Integrity must have exactly 5 criteria (PI1.1-PI1.5)"

        # No fabricated category may exist.
        assert framework.get_controls_by_category("CA") == [], (
            "The 'Confidentiality & Availability (CA)' category does not exist "
            "in the real TSC and must never reappear"
        )

    def test_control_has_evidence_mapping(self):
        """Test that controls carry evidence requirements."""
        framework = SOC2Framework()
        controls = framework.get_all_controls()

        # Every control must declare its canonical required_evidence list
        # (the scoring engine's input). Empty requirements would make the
        # control unscorable; assert they are non-empty.
        for control in controls:
            assert hasattr(control, "required_evidence"), (
                f"Control {control.id} missing required_evidence"
            )
            assert control.required_evidence is not None, (
                f"Control {control.id} has null required_evidence"
            )
            assert len(control.required_evidence) > 0, (
                f"Control {control.id} has empty required_evidence"
            )

    def test_control_structure_is_valid(self):
        """Test that SOC 2 controls have proper structure."""
        framework = SOC2Framework()
        controls = framework.get_all_controls()

        for control in controls[:3]:  # Test first 3 controls
            assert hasattr(control, "id"), "Control missing ID"
            assert hasattr(control, "title"), "Control missing title"
            assert hasattr(control, "description"), "Control missing description"
            assert hasattr(control, "category"), "Control missing category"
            assert hasattr(control, "required_evidence"), "Control missing required_evidence"

            prefix = control.id.split(".")[0]
            assert prefix in {"CC1", "CC2", "CC3", "CC4", "CC5", "CC6", "CC7", "CC8", "CC9",
                              "A1", "C1", "PI1"}, (
                f"Invalid control ID prefix: {control.id}"
            )


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
