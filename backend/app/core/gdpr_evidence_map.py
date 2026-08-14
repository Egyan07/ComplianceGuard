"""Maps collected evidence types to GDPR (EU) 2016/679 control IDs and base scores."""
from typing import Dict

GDPR_EVIDENCE_CONTROL_MAP: Dict[str, Dict[str, float]] = {
    # Technical collection evidence (AWS/system collectors)
    "s3_encryption":     {"Art.32.1": 0.9},
    "iam_policy":        {"Art.25.1": 0.8, "Art.32.1": 0.7},
    "s3_public_access":  {"Art.32.1": 0.8, "Art.25.2": 0.7},
    "iam_mfa":           {"Art.32.1": 0.9},
    "event_logs":        {"Art.32.1": 0.7, "Art.30.1": 0.8},
    "security_settings": {"Art.25.1": 0.8, "Art.32.1": 0.7},
    "services":          {"Art.28.1": 0.7, "Art.32.1": 0.6},
    "firewall":          {"Art.32.1": 0.8},
    "users":             {"Art.30.1": 0.7, "Art.32.1": 0.7},
    "network":           {"Art.32.1": 0.7},
    "software":          {"Art.25.1": 0.7, "Art.32.1": 0.7},
    "file_permissions":  {"Art.32.1": 0.8, "Art.25.2": 0.7},
    "system_info":       {"Art.30.1": 0.6, "Art.25.1": 0.7},
    "update_status":     {"Art.32.1": 0.8},
    # Organisational/document evidence (uploaded evidence)
    "policy_document":   {"Art.24.1": 0.8, "Art.5.2": 0.8, "Art.13": 0.7, "Art.28.3": 0.7},
    "security_policies": {"Art.24.1": 0.8, "Art.5.1": 0.7, "Art.25.1": 0.7},
    "training_records":  {"Art.32.1": 0.6, "Art.24.1": 0.6},
    "incident_reports":  {"Art.33.1": 0.9, "Art.34.1": 0.8},
    "audit_reports":     {"Art.24.1": 0.7, "Art.30.1": 0.6, "Art.15.1": 0.6},
}
