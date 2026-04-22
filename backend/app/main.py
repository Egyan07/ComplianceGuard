"""
ComplianceGuard SOC 2 Automation Platform - Backend API

FastAPI backend for managing compliance frameworks, evidence collection,
and SOC 2 audit workflows.
"""

from contextlib import asynccontextmanager
import os

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from typing import Dict, Any
from datetime import datetime, timezone
import uvicorn
from slowapi import _rate_limit_exceeded_handler
from slowapi.errors import RateLimitExceeded

from alembic.config import Config as AlembicConfig
from alembic import command as alembic_command

from app.api.auth import router as auth_router
from app.api.evidence import router as evidence_router
from app.api.compliance import router as compliance_router
from app.api.machines import router as machines_router
from app.api.aws_credentials import router as aws_credentials_router
from app.core.config import settings
from app.core.constants import VERSION
from app.core.database import engine, Base
from app.core.rate_limit import limiter

# Import all models so Base.metadata knows about them
import app.models  # noqa: F401

import sentry_sdk
from sentry_sdk.integrations.fastapi import FastApiIntegration
from sentry_sdk.integrations.sqlalchemy import SqlalchemyIntegration

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


@asynccontextmanager
async def lifespan(app: FastAPI):
    if os.getenv("RUN_MIGRATIONS_ON_STARTUP", "true").lower() == "true":
        run_migrations()
    yield


app = FastAPI(
    title="ComplianceGuard SOC 2 API",
    description="Backend API for SOC 2 compliance automation platform",
    version=VERSION,
    lifespan=lifespan,
)

app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)

# Configure CORS for frontend communication
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Include authentication routes
app.include_router(auth_router)

# Include evidence collection routes
app.include_router(evidence_router, prefix="/api/v1")

# Include compliance framework routes
app.include_router(compliance_router)
app.include_router(machines_router)
app.include_router(aws_credentials_router)

@app.get("/health")
async def health_check() -> Dict[str, Any]:
    """
    Health check endpoint for monitoring and deployment validation.

    Returns:
        Dict containing service status and version information
    """
    return {
        "status": "healthy",
        "service": "complianceguard-api",
        "version": VERSION,
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