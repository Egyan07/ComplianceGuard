"""Maps collected evidence types to ISO 27001:2013 Annex A control IDs and base scores."""
from typing import Dict

ISO27001_EVIDENCE_CONTROL_MAP: Dict[str, Dict[str, float]] = {
    "s3_encryption":     {"A.10.1.1": 0.8, "A.13.2.1": 0.7},
    "iam_policy":        {"A.9.1.1": 0.7, "A.9.2.3": 0.8, "A.9.4.1": 0.7},
    "s3_public_access":  {"A.9.4.1": 0.8, "A.13.1.1": 0.7},
    "iam_mfa":           {"A.9.3.1": 0.9, "A.9.4.4": 0.8},
    "event_logs":        {"A.12.4.1": 0.9, "A.16.1.2": 0.7},
    "security_settings": {"A.9.1.1": 0.8, "A.9.2.1": 0.7},
    "services":          {"A.12.1.1": 0.8, "A.14.2.8": 0.6},
    "firewall":          {"A.13.1.1": 0.9, "A.13.2.1": 0.7},
    "users":             {"A.9.2.1": 0.8, "A.9.2.3": 0.8, "A.7.3.1": 0.7},
    "network":           {"A.13.1.1": 0.8, "A.13.2.1": 0.7},
    "software":          {"A.12.6.1": 0.8, "A.14.2.8": 0.7},
    "file_permissions":  {"A.9.4.1": 0.8, "A.9.4.4": 0.7},
    "system_info":       {"A.8.1.1": 0.7, "A.12.1.1": 0.6},
    "update_status":     {"A.12.6.1": 0.8, "A.14.2.8": 0.7},
}
