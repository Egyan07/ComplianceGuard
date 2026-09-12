"""
Compliance evaluation models for ComplianceGuard.

Persists evaluation runs and per-control assessment results.
"""

from sqlalchemy import Column, Integer, String, Float, DateTime, ForeignKey, JSON
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func

from app.core.database import Base


class ComplianceEvaluationRecord(Base):
    """A single compliance evaluation run."""

    __tablename__ = "compliance_evaluations"

    id = Column(Integer, primary_key=True, index=True)
    evaluation_id = Column(String, unique=True, index=True, nullable=False)
    framework_id = Column(String, nullable=False)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    overall_score = Column(Float, nullable=False, default=0.0)
    compliance_status = Column(String, nullable=False, default="not_evaluated")
    compliance_level = Column(String, nullable=False, default="inadequate")
    evaluated_by = Column(String, nullable=False, default="system")
    scope = Column(JSON, nullable=True)
    evidence_summary = Column(JSON, nullable=True)
    risk_assessment = Column(JSON, nullable=True)
    recommendations = Column(JSON, nullable=True)
    control_count = Column(Integer, default=0)
    compliant_controls = Column(Integer, default=0)
    # Taxonomy identity of the framework data used for this evaluation.
    # NULL means the record predates taxonomy versioning (legacy taxonomy).
    # Historical rows are never re-scored: the column only records what the
    # system assessed at the time so trends can mark the transition.
    taxonomy_version = Column(String, nullable=True)
    # What the score measures for this evaluation ("evidence_coverage").
    # NULL means the record predates the semantics field (legacy rows are
    # still evidence-coverage numbers, but were not labelled as such).
    score_semantics = Column(String, nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)

    user = relationship("User")
    assessments = relationship("ControlAssessmentRecord", back_populates="evaluation", cascade="all, delete-orphan")


class ControlAssessmentRecord(Base):
    """Per-control assessment result within an evaluation."""

    __tablename__ = "control_assessments"

    id = Column(Integer, primary_key=True, index=True)
    evaluation_id = Column(Integer, ForeignKey("compliance_evaluations.id"), nullable=False)
    control_id = Column(String, nullable=False, index=True)
    status = Column(String, nullable=False, default="not_evaluated")
    score = Column(Float, nullable=False, default=0.0)
    evidence_provided = Column(JSON, nullable=True)
    gaps = Column(JSON, nullable=True)
    recommendations = Column(JSON, nullable=True)

    evaluation = relationship("ComplianceEvaluationRecord", back_populates="assessments")
