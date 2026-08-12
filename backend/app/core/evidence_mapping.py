"""
Shared mapping from collected evidence_type values to SOC 2 control IDs and base scores.

Imported by both compliance.py (evaluate-from-evidence) and evidence.py (items/{id}/controls).
Extracted here to avoid a circular import between the two API modules.

Control IDs must exist in backend/app/core/soc2_controls.yaml (54 controls).
"""

from typing import Dict

EVIDENCE_CONTROL_MAP: Dict[str, Dict[str, float]] = {
    "s3_encryption":     {"C1.3": 0.8, "C1.2": 0.8, "C1.1": 0.6},
    "iam_policy":        {"CC6.1": 0.7, "CC6.2": 0.8, "CC6.3": 0.7},
    "s3_public_access":  {"C1.4": 0.8, "C1.2": 0.7, "A3.1": 0.7},
    "iam_mfa":           {"CC6.2": 0.9, "CC6.1": 0.7},
    "event_logs":        {"CC7.1": 0.9, "CC4.1": 0.8, "CC5.1": 0.6},
    "security_settings": {"CC6.1": 0.8, "CC6.2": 0.9, "CC6.3": 0.7},
    "services":          {"A1.1": 0.8, "CC7.1": 0.7, "A1.2": 0.6},
    "firewall":          {"A3.2": 0.9, "A3.1": 0.8, "A1.1": 0.6},
    "users":             {"CC6.2": 0.8, "CC6.3": 0.7, "CC6.1": 0.6},
    "network":           {"A3.1": 0.8, "A3.2": 0.8, "A1.1": 0.6},
    "software":          {"CC8.1": 0.8, "CC7.1": 0.7, "A1.1": 0.5},
    "file_permissions":  {"CC6.1": 0.8, "CC6.3": 0.8, "C1.2": 0.6},
    "system_info":       {"A1.3": 0.7, "A1.5": 0.5},
    "update_status":     {"CC8.1": 0.8, "A1.1": 0.6},
}
