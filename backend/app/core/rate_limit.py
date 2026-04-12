"""
Rate limiting configuration for ComplianceGuard.
"""

import os
from slowapi import Limiter
from slowapi.util import get_remote_address

limiter = Limiter(
    key_func=get_remote_address,
    enabled=os.environ.get("ENVIRONMENT") != "testing",
)
