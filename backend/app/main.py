"""
ComplianceGuard SOC 2 Automation Platform - Backend API

FastAPI backend for managing compliance frameworks, evidence collection,
and SOC 2 audit workflows.
"""

from fastapi import FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from typing import Dict, Any
from datetime import datetime, timezone
import uvicorn
from slowapi import _rate_limit_exceeded_handler
from slowapi.errors import RateLimitExceeded

from app.api.auth import router as auth_router
from app.api.evidence import router as evidence_router
from app.api.compliance import router as compliance_router
from app.core.database import engine, Base
from app.core.rate_limit import limiter

# Import all models so Base.metadata knows about them
import app.models  # noqa: F401

app = FastAPI(
    title="ComplianceGuard SOC 2 API",
    description="Backend API for SOC 2 compliance automation platform",
    version="2.3.0"
)

app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)

# Run Alembic migrations on startup
from alembic.config import Config as AlembicConfig
from alembic import command as alembic_command
import os

def run_migrations():
    """Run pending Alembic migrations."""
    alembic_ini = os.path.join(os.path.dirname(__file__), "..", "alembic.ini")
    if os.path.exists(alembic_ini):
        alembic_cfg = AlembicConfig(alembic_ini)
        alembic_cfg.set_main_option("sqlalchemy.url", str(engine.url))
        alembic_command.upgrade(alembic_cfg, "head")
    else:
        # Fallback for environments without alembic.ini (e.g. tests)
        Base.metadata.create_all(bind=engine)

run_migrations()

# Configure CORS for frontend communication
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://localhost:3000"],
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
        "version": "2.3.0",
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