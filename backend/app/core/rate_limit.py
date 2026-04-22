"""
Rate limiting configuration for ComplianceGuard.

slowapi's default in-memory storage is fine for a single-process deployment.
It is NOT safe once you're running multiple workers (e.g. ``uvicorn --workers 4``
or multiple container replicas) — each worker maintains its own independent
counter, so the published rate limits silently allow Nx more traffic than
advertised.

To fix this in production: set ``RATELIMIT_STORAGE_URI`` to a shared backend,
typically Redis:

    RATELIMIT_STORAGE_URI=redis://redis.internal:6379/0

With that env var set, slowapi stores counters in Redis and the limits hold
across every worker and every replica. Without it, this module logs a single
WARNING on startup when ``WORKERS > 1`` so the drift is not silent.
"""

import logging
import os

from slowapi import Limiter
from slowapi.util import get_remote_address

logger = logging.getLogger(__name__)

_STORAGE_URI = os.environ.get("RATELIMIT_STORAGE_URI")
_WORKERS = int(os.environ.get("WORKERS", "1") or "1")

if _WORKERS > 1 and not _STORAGE_URI:
    logger.warning(
        "Rate limiter is using in-memory storage but WORKERS=%d. "
        "Counters will drift across workers — set RATELIMIT_STORAGE_URI "
        "(e.g. redis://host:6379/0) for a shared backend.",
        _WORKERS,
    )

_limiter_kwargs: dict = {
    "key_func": get_remote_address,
    "enabled": os.environ.get("ENVIRONMENT") != "testing",
}
if _STORAGE_URI:
    _limiter_kwargs["storage_uri"] = _STORAGE_URI

limiter = Limiter(**_limiter_kwargs)
