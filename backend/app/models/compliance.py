"""
Compliance framework model for ComplianceGuard.

This module defines the ComplianceFramework SQLAlchemy model representing
different compliance frameworks like SOC 2, ISO 27001, etc.
"""

from sqlalchemy import Column, Integer, String, DateTime, Text, ForeignKey, Enum
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from datetime import datetime
from enum import Enum as PyEnum
from typing import TYPE_CHECKING

from app.core.database import Base


if TYPE_CHECKING:
    from app.models.company import Company


class FrameworkType(str, PyEnum):
    """Enumeration of supported compliance framework types."""
    SOC2 = "SOC2"
    ISO27001 = "ISO27001"
    NIST = "NIST"
    HIPAA = "HIPAA"
    PCI_DSS = "PCI_DSS"
    GDPR = "GDPR"


class ComplianceFramework(Base):
    """Compliance framework model representing different compliance standards."""

    __tablename__ = "compliance_frameworks"

    # Primary key
    id = Column(Integer, primary_key=True, index=True)

    # Framework information
    name = Column(String, nullable=False, index=True)
    framework_type = Column(
        Enum(FrameworkType, name="framework_type"),
        nullable=False,
        index=True
    )
    version = Column(String, nullable=True)
    description = Column(Text, nullable=True)

    # Status and progress
    status = Column(String, default="not_started", nullable=False)  # not_started, in_progress, completed, failed
    progress_percentage = Column(Integer, default=0, nullable=False)  # 0-100

    # Company relationship — TODO: flip back to nullable=False once the
    # company-management API is in place. Right now there's no way to create
    # a Company, so a NOT NULL constraint would make every insert fail.
    company_id = Column(Integer, ForeignKey("companies.id"), nullable=True)

    # Timestamps
    created_at = Column(
        DateTime(timezone=True),
        server_default=func.now(),
        nullable=False
    )
    updated_at = Column(
        DateTime(timezone=True),
        server_default=func.now(),
        onupdate=func.now(),
        nullable=False
    )
    last_audit_date = Column(DateTime(timezone=True), nullable=True)
    next_audit_date = Column(DateTime(timezone=True), nullable=True)

    # Relationships
    company = relationship("Company", back_populates="compliance_frameworks")

    def __repr__(self):
        return f"<ComplianceFramework(id={self.id}, name='{self.name}', type='{self.framework_type.value}')>"

    def to_dict(self):
        """Convert compliance framework to dictionary representation."""
        return {
            "id": self.id,
            "name": self.name,
            "framework_type": self.framework_type.value,
            "version": self.version,
            "description": self.description,
            "status": self.status,
            "progress_percentage": self.progress_percentage,
            "company_id": self.company_id,
            "created_at": self.created_at.isoformat() if self.created_at else None,
            "updated_at": self.updated_at.isoformat() if self.updated_at else None,
            "last_audit_date": self.last_audit_date.isoformat() if self.last_audit_date else None,
            "next_audit_date": self.next_audit_date.isoformat() if self.next_audit_date else None
        }

    def update_progress(self, percentage: int):
        """Update the progress percentage of the framework."""
        if 0 <= percentage <= 100:
            self.progress_percentage = percentage
            if percentage == 100:
                self.status = "completed"
            elif percentage > 0:
                self.status = "in_progress"
        else:
            raise ValueError("Progress percentage must be between 0 and 100")

    def is_audit_due(self) -> bool:
        """Check if the framework is due for audit."""
        if not self.next_audit_date:
            return False
        return datetime.now(self.next_audit_date.tzinfo) >= self.next_audit_date