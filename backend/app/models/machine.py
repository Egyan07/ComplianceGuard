"""
Machine model for ComplianceGuard Cloud Dashboard.

Tracks Windows endpoints that sync compliance snapshots to the web server.
"""

from sqlalchemy import CheckConstraint, Column, Integer, String, Boolean, DateTime, Float, ForeignKey, UniqueConstraint
from sqlalchemy.sql import func

from app.core.constants import VALID_COMPLIANCE_LEVELS  # re-exported for backwards compat
from app.core.database import Base


__all__ = ["Machine", "VALID_COMPLIANCE_LEVELS"]


class Machine(Base):
    """A Windows endpoint registered by a user for cloud sync."""

    __tablename__ = "machines"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    hostname = Column(String, nullable=False)
    os_version = Column(String, nullable=True)
    last_score = Column(Float, nullable=True)
    compliance_level = Column(String, nullable=True)  # compliant / at_risk / critical
    evidence_count = Column(Integer, nullable=True)
    agent_version = Column(String, nullable=True)
    last_sync_at = Column(DateTime(timezone=True), nullable=True)
    is_active = Column(Boolean, default=True, nullable=False)
    created_at = Column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    updated_at = Column(
        DateTime(timezone=True),
        server_default=func.now(),
        onupdate=func.now(),
        nullable=False,
    )

    __table_args__ = (
        UniqueConstraint("user_id", "hostname", name="uq_machine_user_hostname"),
        CheckConstraint(
            "compliance_level IS NULL OR compliance_level IN ('compliant', 'at_risk', 'critical')",
            name="ck_machines_compliance_level",
        ),
    )
