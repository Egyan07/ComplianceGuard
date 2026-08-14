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
from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import PlainTextResponse
from sqlalchemy import text
from prometheus_client import CONTENT_TYPE_LATEST, generate_latest
from sentry_sdk.integrations.fastapi import FastApiIntegration
from sentry_sdk.integrations.sqlalchemy import SqlalchemyIntegration
from slowapi import _rate_limit_exceeded_handler
from slowapi.errors import RateLimitExceeded

from app.api.auth import router as auth_router
from app.api.aws_credentials import router as aws_credentials_router
from app.api.iso27001 import router as iso27001_router
from app.api.hipaa import router as hipaa_router
from app.api.gdpr import router as gdpr_router
from app.api.enterprise.audit import router as enterprise_audit_router
from app.api.enterprise.branding import router as enterprise_branding_router
from app.api.enterprise.export import router as enterprise_export_router
from app.api.enterprise.rbac import router as enterprise_rbac_router
from app.api.compliance import router as compliance_router
from app.api.evidence import router as evidence_router
from app.api.machines import router as machines_router
from app.core.config import settings
from app.core.constants import VERSION
from app.core.database import Base, engine, SessionLocal
from app.core.observability import (
    APP_INFO,
    configure_logging,
    now_ms,
    record_request,
)
from app.core.rate_limit import limiter

import app.models  # noqa: F401

logger = logging.getLogger(__name__)

# Structured logging (LOG_FORMAT=json for JSON lines) + Prometheus build info.
configure_logging(level=settings.log_level)
APP_INFO.labels(version=VERSION, git_sha=os.getenv("GIT_SHA", "dev")).set(1.0)

_enterprise_mode = os.getenv("ENTERPRISE_MODE", "false").lower() == "true"
if settings.sentry_dsn and not _enterprise_mode:
    sentry_sdk.init(
        dsn=settings.sentry_dsn,
        environment=str(settings.environment.value),
        integrations=[FastApiIntegration(), SqlalchemyIntegration()],
        traces_sample_rate=settings.sentry_traces_sample_rate,
        send_default_pii=False,  # Do not send PII — compliance requirement
    )
elif _enterprise_mode:
    logger.info("ENTERPRISE_MODE=true: Sentry telemetry disabled")


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
    # Auth is via the Authorization header (bearer tokens), never cookies, so
    # credentialed cross-origin requests are unnecessary. Keeping this False
    # avoids credential leakage if CORS_ORIGINS is ever misconfigured.
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.middleware("http")
async def metrics_middleware(request: Request, call_next):
    """Record every request into the Prometheus metrics (excluding /metrics
    itself to avoid self-referential scrapes)."""
    if request.url.path == "/metrics":
        return await call_next(request)
    start = now_ms()
    response = await call_next(request)
    # Use the Starlette route template (e.g. /api/v1/users/{user_id}) so label
    # cardinality stays bounded, falling back to the raw path for unmatched routes.
    path_template = getattr(request.scope.get("route"), "path", request.url.path)
    record_request(
        method=request.method,
        path_template=path_template,
        status_code=response.status_code,
        duration_s=now_ms() - start,
    )
    return response


@app.get("/metrics")
async def metrics() -> PlainTextResponse:
    """Prometheus scrape endpoint."""
    return PlainTextResponse(generate_latest(), media_type=CONTENT_TYPE_LATEST)

# All routers define only resource-level paths (e.g. /auth, /evidence).
# The shared /api/v1 prefix is applied here so the convention is enforced
# in a single place and individual routers stay prefix-free.
app.include_router(auth_router, prefix="/api/v1")
app.include_router(evidence_router, prefix="/api/v1")
app.include_router(compliance_router, prefix="/api/v1")
app.include_router(machines_router, prefix="/api/v1")
app.include_router(aws_credentials_router, prefix="/api/v1")
app.include_router(iso27001_router, prefix="/api/v1")
app.include_router(hipaa_router, prefix="/api/v1")
app.include_router(gdpr_router, prefix="/api/v1")
app.include_router(enterprise_audit_router, prefix="/api/v1")
app.include_router(enterprise_branding_router, prefix="/api/v1")
app.include_router(enterprise_export_router, prefix="/api/v1")
app.include_router(enterprise_rbac_router, prefix="/api/v1")

@app.get("/health")
async def health_check() -> Dict[str, Any]:
    """
    Health check for monitoring and deployment validation.

    ``git_sha`` lets oncall map an incident to a specific deploy even when the
    version string hasn't been bumped; ``started_at`` exposes worker age so
    rolling-restart regressions are obvious.

    Includes a live DB connectivity probe so load balancers / orchestrators can
    pull an instance that has lost its database before routing traffic to it.
    The probe is cheap (SELECT 1) and runs only on this endpoint.
    """
    db_ok = True
    try:
        db = SessionLocal()
        try:
            db.execute(text("SELECT 1"))
        finally:
            db.close()
    except Exception:
        logger.exception("health check DB probe failed")
        db_ok = False

    return {
        "status": "healthy" if db_ok else "degraded",
        "service": "complianceguard-api",
        "version": VERSION,
        "git_sha": _GIT_SHA,
        "database": "ok" if db_ok else "unreachable",
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
