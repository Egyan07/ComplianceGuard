from sqlalchemy import Column, Integer, String, Float, DateTime, ForeignKey, Text
from sqlalchemy.sql import func
from app.core.database import Base
try:
    from sqlalchemy.dialects.postgresql import JSONB
    _JSON = JSONB
except ImportError:
    from sqlalchemy import JSON
    _JSON = JSON


class AuditLog(Base):
    __tablename__ = "audit_log"

    id = Column(Integer, primary_key=True, index=True)
    event_type = Column(String, nullable=False)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    framework = Column(String, nullable=True)
    score = Column(Float, nullable=True)
    detail_json = Column(_JSON, nullable=True)
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
