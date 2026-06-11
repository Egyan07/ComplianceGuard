from sqlalchemy import Column, Integer, String, Float, DateTime, ForeignKey, Text, JSON, UniqueConstraint
from sqlalchemy.sql import func
from app.core.database import Base


class AuditLog(Base):
    __tablename__ = "audit_log"
    # A non-null prev_hash may appear at most once: two concurrent appends that
    # both read the same last entry would both try to claim it as predecessor,
    # forking the chain. The unique constraint makes the loser fail (and retry).
    # NULLs (the genesis entry) are exempt — SQL treats NULLs as distinct.
    __table_args__ = (UniqueConstraint("prev_hash", name="uq_audit_log_prev_hash"),)

    id = Column(Integer, primary_key=True, index=True)
    event_type = Column(String, nullable=False)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    framework = Column(String, nullable=True)
    score = Column(Float, nullable=True)
    detail_json = Column(JSON, nullable=True)
    prev_hash = Column(String(64), nullable=True)
    entry_hash = Column(String(64), nullable=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)


class EnterpriseConfig(Base):
    __tablename__ = "enterprise_config"

    id = Column(Integer, primary_key=True, index=True)
    company_name = Column(String, nullable=False)
    logo_base64 = Column(Text, nullable=True)
    report_footer = Column(String, nullable=True)
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False)


class UserRole(Base):
    __tablename__ = "user_roles"

    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), primary_key=True)
    role = Column(String, nullable=False)
    assigned_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)
