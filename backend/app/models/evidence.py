"""
Evidence models for ComplianceGuard.

Stores evidence collection runs and individual evidence items.
"""

from sqlalchemy import Column, Integer, String, DateTime, Text, Float, ForeignKey, JSON
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func

from app.core.database import Base


class EvidenceCollection(Base):
    """A single evidence collection run."""

    __tablename__ = "evidence_collections"

    id = Column(Integer, primary_key=True, index=True)
    collection_id = Column(String, unique=True, index=True, nullable=False)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    status = Column(String, nullable=False, default="in_progress")  # in_progress, success, partial_failure, failed
    evidence_count = Column(Integer, default=0)
    failed_count = Column(Integer, default=0)
    summary = Column(JSON, nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)

    user = relationship("User")
    items = relationship("EvidenceItem", back_populates="collection", cascade="all, delete-orphan")


class EvidenceItem(Base):
    """An individual evidence record."""

    __tablename__ = "evidence_items"

    id = Column(Integer, primary_key=True, index=True)
    collection_id = Column(Integer, ForeignKey("evidence_collections.id"), nullable=False)
    evidence_type = Column(String, nullable=False, index=True)  # s3_encryption, iam_policy, event_logs, etc.
    source = Column(String, nullable=False, default="manual")  # aws, manual, system
    status = Column(String, nullable=False, default="compliant")  # compliant, non_compliant, warning, unknown
    data = Column(JSON, nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)

    collection = relationship("EvidenceCollection", back_populates="items")
