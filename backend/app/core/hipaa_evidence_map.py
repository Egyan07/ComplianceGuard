"""Maps collected evidence types to HIPAA Security Rule control IDs and base scores."""
from typing import Dict

HIPAA_EVIDENCE_CONTROL_MAP: Dict[str, Dict[str, float]] = {
    "s3_encryption":     {"164.312.a.2.iv": 0.8, "164.312.e.2.ii": 0.8},
    "iam_policy":        {"164.308.a.4.ii.B": 0.8, "164.312.a.2.i": 0.7},
    "s3_public_access":  {"164.312.a.2.ii": 0.8, "164.312.e.2.ii": 0.7},
    "iam_mfa":           {"164.312.d": 0.9, "164.312.a.2.i": 0.9},
    "event_logs":        {"164.312.b": 0.9, "164.308.a.1.ii.D": 0.8},
    "security_settings": {"164.308.a.1": 0.8, "164.308.a.3.i": 0.7},
    "services":          {"164.308.a.1.ii.B": 0.7, "164.312.a.2.iii": 0.6},
    "firewall":          {"164.312.e.2.i": 0.9, "164.312.a.2.ii": 0.7},
    "users":             {"164.308.a.3.i": 0.8, "164.312.a.2.i": 0.8},
    "network":           {"164.312.e.2.i": 0.8, "164.312.e.2.ii": 0.8},
    "software":          {"164.308.a.1.ii.B": 0.7, "164.308.a.1.ii.A": 0.6},
    "file_permissions":  {"164.312.a.2.ii": 0.8, "164.312.c.2": 0.7},
    "system_info":       {"164.308.a.1.ii.A": 0.7, "164.308.a.7.ii.A": 0.6},
    "update_status":     {"164.308.a.1.ii.B": 0.8, "164.308.a.5.ii.B": 0.7},
}
