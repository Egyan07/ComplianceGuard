"""Tests for framework_scoring helpers."""
import pytest
from app.core.framework_scoring import score_from_map, derive_overall


class _Item:
    def __init__(self, evidence_type: str):
        self.evidence_type = evidence_type


SAMPLE_MAP = {
    "event_logs": {"CC7.1": 0.9, "CC4.1": 0.8},
    "firewall":   {"A3.2": 0.9},
}


class TestScoreFromMap:
    def test_empty_items_returns_empty(self):
        assert score_from_map([], SAMPLE_MAP) == {}

    def test_unmapped_type_is_skipped(self):
        assert score_from_map([_Item("unknown")], SAMPLE_MAP) == {}

    def test_single_item_maps_to_correct_controls(self):
        result = score_from_map([_Item("event_logs")], SAMPLE_MAP)
        assert result["CC7.1"]["score"] == 0.9
        assert result["CC4.1"]["score"] == 0.8
        assert "event_logs" in result["CC7.1"]["evidence_provided"]

    def test_firewall_maps_to_network_control(self):
        result = score_from_map([_Item("firewall")], SAMPLE_MAP)
        assert result["A3.2"]["score"] == 0.9

    def test_max_score_wins_when_same_control_appears_twice(self):
        two_map = {
            "type_a": {"CC6.1": 0.7},
            "type_b": {"CC6.1": 0.9},
        }
        result = score_from_map([_Item("type_a"), _Item("type_b")], two_map)
        assert result["CC6.1"]["score"] == 0.9

    def test_both_evidence_types_recorded_for_same_control(self):
        two_map = {
            "type_a": {"CC6.1": 0.7},
            "type_b": {"CC6.1": 0.9},
        }
        result = score_from_map([_Item("type_a"), _Item("type_b")], two_map)
        assert set(result["CC6.1"]["evidence_provided"]) == {"type_a", "type_b"}


class TestDeriveOverall:
    def test_empty_returns_zero_score(self):
        r = derive_overall({})
        assert r["overall_score"] == 0.0
        assert r["control_count"] == 0
        assert r["compliant_controls"] == 0

    def test_all_compliant_returns_compliant_status(self):
        scores = {"CC1": {"score": 0.95}, "CC2": {"score": 0.92}}
        r = derive_overall(scores)
        assert r["compliance_status"] == "compliant"
        assert r["compliant_controls"] == 2

    def test_mid_range_returns_partially_compliant(self):
        scores = {"CC1": {"score": 0.7}}
        r = derive_overall(scores)
        assert r["compliance_status"] == "partially_compliant"

    def test_low_score_returns_non_compliant(self):
        scores = {"CC1": {"score": 0.3}}
        r = derive_overall(scores)
        assert r["compliance_status"] == "non_compliant"

    def test_compliance_level_adequate(self):
        scores = {"CC1": {"score": 0.75}}
        r = derive_overall(scores)
        assert r["compliance_level"] == "adequate"
