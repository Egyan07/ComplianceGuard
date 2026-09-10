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
across every worker and every replica. Without it, this module refuses to
start in production unless the deployment provably runs a single worker
(WORKERS declared as 1, REPLICAS declared as 1); non-production deployments
get a loud WARNING instead so the drift is never silent.
"""

import logging
import os

from slowapi import Limiter
from slowapi.util import get_remote_address


logger = logging.getLogger(__name__)

_STORAGE_URI = os.environ.get("RATELIMIT_STORAGE_URI")
_WORKERS_DECLARED = "WORKERS" in os.environ
_WORKERS = int(os.environ.get("WORKERS", "1") or "1")


def validate_rate_limit_configuration() -> None:
    """Fail fast when a scaled-out deployment lacks shared limiter storage.

    M-3 remediation: in-memory counters are per-process. With WORKERS > 1 or
    multiple replicas the published limits silently allow N× the traffic and
    the per-account brute-force throttle loses its teeth. A WARNING is not
    enough for production, so:

      - production + (WORKERS > 1 or REPLICAS > 1) and no RATELIMIT_STORAGE_URI
        → refuse to start (RuntimeError at import time).
      - production + WORKERS **unset** and no RATELIMIT_STORAGE_URI → also
        refuse. A worker process cannot observe how many siblings uvicorn's
        ``--workers`` flag spawned, so an undeclared count is not provably 1;
        ``uvicorn --workers 4`` without the WORKERS env var previously bypassed
        this guard entirely. Declare ``WORKERS=1`` to affirm a single worker,
        or provide shared storage (which makes the count irrelevant).
      - non-production keeps the loud warning (dev convenience preserved — no
        Redis required to run tests or a laptop stack).

    Set REPLICAS=1 explicitly when an orchestrator runs one replica per
    process container; multi-replica deployments must provide a shared
    RATELIMIT_STORAGE_URI (redis://...).
    """
    if _STORAGE_URI:
        return
    replicas = int(os.environ.get("REPLICAS", "1") or "1")
    if _WORKERS > 1 or replicas > 1:
        raise_or_warn(
            "Rate limiting is process-local but the deployment is scaled out "
            "(WORKERS=%d, REPLICAS=%d). Published limits would be multiplied and "
            "login throttling would not be shared. Set RATELIMIT_STORAGE_URI "
            "(e.g. redis://host:6379/0) or pin WORKERS=1/REPLICAS=1." % (_WORKERS, replicas)
        )
        return
    if not _WORKERS_DECLARED:
        # Declaring REPLICAS says nothing about how many uvicorn workers run
        # *inside* this process, so it cannot vouch for the worker count.
        raise_or_warn(
            "Rate limiting is process-local and the worker count is undeclared. "
            "uvicorn's --workers flag is invisible to this process, so an "
            "undeclared count cannot be assumed to be 1: 'uvicorn --workers 4' "
            "would silently multiply every published limit. Set WORKERS=1 to "
            "affirm a single worker, or set RATELIMIT_STORAGE_URI "
            "(e.g. redis://host:6379/0) to share counters across any count."
        )


def raise_or_warn(message: str) -> None:
    """Raise in production (fail-fast) or log a warning elsewhere."""
    if os.environ.get("ENVIRONMENT") == "production":
        raise RuntimeError(message)
    logger.warning(message)

validate_rate_limit_configuration()

_limiter_kwargs: dict = {
    "key_func": get_remote_address,
    "enabled": os.environ.get("ENVIRONMENT") != "testing",
}
if _STORAGE_URI:
    _limiter_kwargs["storage_uri"] = _STORAGE_URI

limiter = Limiter(**_limiter_kwargs)
