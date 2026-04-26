"""
ComplianceGuard SOC 2 Automation Platform - Backend API

FastAPI backend for managing compliance frameworks, evidence collection,
and SOC 2 audit workflows.
"""

import asyncio
import logging
import os
from contextlib import asynccontextmanager
from datetime import datetime, timezone
from typing import Dict, Any

import sentry_sdk
import uvicorn
from alembic import command as alembic_command
from alembic.config import Config as AlembicConfig
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from sentry_sdk.integrations.fastapi import FastApiIntegration
from sentry_sdk.integrations.sqlalchemy import SqlalchemyIntegration
from slowapi import _rate_limit_exceeded_handler
from slowapi.errors import RateLimitExceeded

from app.api.auth import router as auth_router
from app.api.aws_credentials import router as aws_credentials_router
from app.api.compliance import router as compliance_router
from app.api.evidence import router as evidence_router
from app.api.machines import router as machines_router
from app.core.config import settings
from app.core.constants import VERSION
from app.core.database import Base, engine
from app.core.rate_limit import limiter

import app.models  # noqa: F401

logger = logging.getLogger(__name__)

if settings.sentry_dsn:
    sentry_sdk.init(
        dsn=settings.sentry_dsn,
        environment=str(settings.environment.value),
        integrations=[FastApiIntegration(), SqlalchemyIntegration()],
        traces_sample_rate=settings.sentry_traces_sample_rate,
        send_default_pii=False,  # Do not send PII — compliance requirement
    )


def run_migrations() -> None:
    """Run pending Alembic migrations.

    Invoked from the FastAPI lifespan handler, not at module import time — so
    importing ``app.main`` (e.g. from pytest) does NOT hit the database. In
    multi-worker deployments (``uvicorn --workers > 1``) every worker still
    races on ``alembic_version`` when the default is kept; production
    deployments should set ``RUN_MIGRATIONS_ON_STARTUP=false`` and apply
    migrations in a dedicated pre-start step (init container, Dockerfile
    ENTRYPOINT wrapper, etc.) so only one process runs ``alembic upgrade head``.
    """
    alembic_ini = os.path.join(os.path.dirname(__file__), "..", "alembic.ini")
    if os.path.exists(alembic_ini):
        alembic_cfg = AlembicConfig(alembic_ini)
        alembic_cfg.set_main_option("sqlalchemy.url", str(engine.url))
        alembic_command.upgrade(alembic_cfg, "head")
    else:
        # Fallback for environments without alembic.ini (e.g. ad-hoc scripts)
        Base.metadata.create_all(bind=engine)


async def _cleanup_expired_refresh_tokens() -> None:
    """Background task: delete expired rows from refresh_tokens table hourly."""
    from app.core.database import SessionLocal
    from app.models.refresh_token import RefreshToken

    while True:
        await asyncio.sleep(3600)
        try:
            db = SessionLocal()
            try:
                deleted = (
                    db.query(RefreshToken)
                    .filter(RefreshToken.expires_at < datetime.now(timezone.utc))
                    .delete(synchronize_session=False)
                )
                db.commit()
                if deleted:
                    logger.info("Refresh token cleanup: removed %d expired rows", deleted)
            finally:
                db.close()
        except Exception:
            logger.exception("Refresh token cleanup task failed")


def _check_ratelimit_backend() -> None:
    """Validate the rate-limit storage backend is reachable at startup."""
    storage_uri = os.environ.get("RATELIMIT_STORAGE_URI")
    if not storage_uri:
        return
    safe_uri = storage_uri.rsplit("@", 1)[-1]  # strip credentials for log
    try:
        import redis as _redis
        r = _redis.from_url(storage_uri, socket_connect_timeout=2, socket_timeout=2)
        r.ping()
        logger.info("Rate limiter Redis backend reachable: %s", safe_uri)
    except ImportError:
        logger.warning(
            "RATELIMIT_STORAGE_URI is set but the 'redis' package is not installed. "
            "Run: pip install redis>=4"
        )
    except Exception as exc:
        logger.error(
            "Rate limiter backend unreachable (%s): %s — counters will NOT be "
            "shared across workers. Fix RATELIMIT_STORAGE_URI or remove it.",
            safe_uri,
            exc,
        )


@asynccontextmanager
async def lifespan(app: FastAPI):
    if os.getenv("RUN_MIGRATIONS_ON_STARTUP", "true").lower() == "true":
        run_migrations()
    _check_ratelimit_backend()
    cleanup_task = asyncio.create_task(_cleanup_expired_refresh_tokens())
    yield
    cleanup_task.cancel()
    try:
        await cleanup_task
    except asyncio.CancelledError:
        pass


app = FastAPI(
    title="ComplianceGuard SOC 2 API",
    description="Backend API for SOC 2 compliance automation platform",
    version=VERSION,
    lifespan=lifespan,
)

app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)

# Captured once at boot so /health can report uptime without re-reading the
# environment on every request. GIT_SHA is injected by CI (see .github/workflows)
# and defaults to "dev" so local runs always get *something* back.
_SERVICE_STARTED_AT = datetime.now(timezone.utc)
_GIT_SHA = os.getenv("GIT_SHA", "dev")

# Configure CORS for frontend communication
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# All routers define only resource-level paths (e.g. /auth, /evidence).
# The shared /api/v1 prefix is applied here so the convention is enforced
# in a single place and individual routers stay prefix-free.
app.include_router(auth_router, prefix="/api/v1")
app.include_router(evidence_router, prefix="/api/v1")
app.include_router(compliance_router, prefix="/api/v1")
app.include_router(machines_router, prefix="/api/v1")
app.include_router(aws_credentials_router, prefix="/api/v1")

@app.get("/health")
async def health_check() -> Dict[str, Any]:
    """
    Health check for monitoring and deployment validation.

    ``git_sha`` lets oncall map an incident to a specific deploy even when the
    version string hasn't been bumped; ``started_at`` exposes worker age so
    rolling-restart regressions are obvious.
    """
    return {
        "status": "healthy",
        "service": "complianceguard-api",
        "version": VERSION,
        "git_sha": _GIT_SHA,
        "started_at": _SERVICE_STARTED_AT.isoformat(),
        "timestamp": datetime.now(timezone.utc).isoformat(),
    }

@app.get("/")
async def root():
    """
    Root endpoint providing basic API information.
    """
    return {
        "message": "ComplianceGuard SOC 2 Automation Platform API",
        "documentation": "/docs",
        "health_check": "/health"
    }

if __name__ == "__main__":
    uvicorn.run(
        "app.main:app",
        host="127.0.0.1",
        port=8000,
        reload=True,
        log_level="info"
    )
