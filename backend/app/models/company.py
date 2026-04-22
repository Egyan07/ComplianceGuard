"""
Company model for ComplianceGuard.

This module defines the Company SQLAlchemy model representing
organizations using the ComplianceGuard platform.
"""

from sqlalchemy import Column, Integer, String, DateTime, Text
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from typing import TYPE_CHECKING

from app.core.database import Base


if TYPE_CHECKING:
    pass


class Company(Base):
    """Company model representing organizations."""

    __tablename__ = "companies"

    # Primary key
    id = Column(Integer, primary_key=True, index=True)

    # Company information
    name = Column(String, nullable=False, index=True)
    domain = Column(String, unique=True, nullable=True, index=True)
    description = Column(Text, nullable=True)

    # Contact information
    address = Column(String, nullable=True)
    phone = Column(String, nullable=True)
    website = Column(String, nullable=True)

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

    # Relationships
    users = relationship("User", back_populates="company")
    compliance_frameworks = relationship(
        "ComplianceFramework",
        back_populates="company",
        cascade="all, delete-orphan"
    )

    def __repr__(self):
        return f"<Company(id={self.id}, name='{self.name}', domain='{self.domain}')>"

    def to_dict(self):
        """Convert company to dictionary representation."""
        return {
            "id": self.id,
            "name": self.name,
            "domain": self.domain,
            "description": self.description,
            "address": self.address,
            "phone": self.phone,
            "website": self.website,
            "created_at": self.created_at.isoformat() if self.created_at else None,
            "updated_at": self.updated_at.isoformat() if self.updated_at else None
        }

    @property
    def user_count(self) -> int:
        """Get the number of users in the company."""
        return len(self.users) if self.users else 0

    @property
    def framework_count(self) -> int:
        """Get the number of compliance frameworks for the company."""
        return len(self.compliance_frameworks) if self.compliance_frameworks else 0
