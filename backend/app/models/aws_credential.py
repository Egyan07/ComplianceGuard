"""
AwsCredential model for ComplianceGuard.

Stores per-user AWS credentials encrypted at rest.
The secret access key is never returned to the client after it is saved.
"""

from sqlalchemy import Column, Integer, String, DateTime, ForeignKey, UniqueConstraint
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func

from app.core.database import Base


class AwsCredential(Base):
    """Encrypted AWS credential store, one row per user."""

    __tablename__ = "aws_credentials"
    __table_args__ = (
        # One active credential set per user
        UniqueConstraint("user_id", name="uq_aws_credentials_user_id"),
    )

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False)

    # Stored as "enc:<base64-fernet-token>" — never plaintext
    encrypted_access_key_id = Column(String, nullable=False)
    encrypted_secret_access_key = Column(String, nullable=False)

    # Plaintext region — not sensitive
    region = Column(String, nullable=False, default="us-east-1")

    # Optional human label e.g. "prod-audit-role"
    label = Column(String, nullable=True)

    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    updated_at = Column(
        DateTime(timezone=True),
        server_default=func.now(),
        onupdate=func.now(),
        nullable=False,
    )

    user = relationship("User", backref="aws_credentials")
