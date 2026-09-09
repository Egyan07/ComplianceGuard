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


def validate_rate_limit_configuration() -> None:
    """Fail fast when a scaled-out deployment lacks shared limiter storage.

    M-3 remediation: in-memory counters are per-process. With WORKERS > 1 or
    multiple replicas the published limits silently allow N× the traffic and
    the per-account brute-force throttle loses its teeth. A WARNING is not
    enough for production, so:

      - production + (WORKERS > 1 or REPLICAS > 1) and no RATELIMIT_STORAGE_URI
        → refuse to start (ConfigurationError at import time).
      - non-production keeps the loud warning (dev convenience preserved — no
        Redis required to run tests or a laptop stack).

    Set REPLICAS=1 explicitly when an orchestrator runs one replica per
    process container; multi-replica deployments must provide a shared
    RATELIMIT_STORAGE_URI (redis://...).
    """
    if _STORAGE_URI:
        return
    replicas = int(os.environ.get("REPLICAS", "1") or "1")
    scaled_out = _WORKERS > 1 or replicas > 1
    if not scaled_out:
        return
    message = (
        "Rate limiting is process-local but the deployment is scaled out "
        "(WORKERS=%d, REPLICAS=%d). Published limits would be multiplied and "
        "login throttling would not be shared. Set RATELIMIT_STORAGE_URI "
        "(e.g. redis://host:6379/0) or pin WORKERS=1/REPLICAS=1." % (_WORKERS, replicas)
    )
    if os.environ.get("ENVIRONMENT") == "production":
        raise RuntimeError(message)
    logger.warning(message)


if _WORKERS > 1 and not _STORAGE_URI:
    logger.warning(
        "Rate limiter is using in-memory storage but WORKERS=%d. "
        "Counters will drift across workers — set RATELIMIT_STORAGE_URI "
        "(e.g. redis://host:6379/0) for a shared backend.",
        _WORKERS,
    )

validate_rate_limit_configuration()

_limiter_kwargs: dict = {
    "key_func": get_remote_address,
    "enabled": os.environ.get("ENVIRONMENT") != "testing",
}
if _STORAGE_URI:
    _limiter_kwargs["storage_uri"] = _STORAGE_URI

limiter = Limiter(**_limiter_kwargs)
