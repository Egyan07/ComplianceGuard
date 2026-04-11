"""
ComplianceGuard SOC 2 Automation Platform - Backend API

FastAPI backend for managing compliance frameworks, evidence collection,
and SOC 2 audit workflows.
"""

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from typing import Dict, Any
import uvicorn

from app.api.auth import router as auth_router
from app.api.evidence import router as evidence_router
from app.api.compliance import router as compliance_router

app = FastAPI(
    title="ComplianceGuard SOC 2 API",
    description="Backend API for SOC 2 compliance automation platform",
    version="0.1.0"
)

# Configure CORS for frontend communication
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173"],  # React dev server
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
        "version": "0.1.0",
        "timestamp": "2024-01-15T10:00:00Z"
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