"""
Refresh token persistence model.

Each issued refresh token has a DB record keyed by its JTI (JWT ID).
Revoking a token (logout) sets ``revoked_at``; the refresh endpoint
rejects any token whose JTI maps to a revoked or expired DB row.
"""

from datetime import datetime, timezone

from sqlalchemy import Column, DateTime, ForeignKey, Integer, String
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func

from app.core.database import Base


class RefreshToken(Base):
    __tablename__ = "refresh_tokens"

    id = Column(Integer, primary_key=True, index=True)
    jti = Column(String(64), unique=True, index=True, nullable=False)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    # Rotation family (Phase 11): every refresh revokes the presented token and
    # issues a new one in the SAME family. Replaying a rotated token revokes the
    # whole family. NULL on legacy pre-rotation rows (they are promoted into a
    # fresh family on their next refresh).
    family_id = Column(String(64), index=True, nullable=True)
    expires_at = Column(DateTime(timezone=True), nullable=False)
    revoked_at = Column(DateTime(timezone=True), nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)

    user = relationship("User")

    @property
    def is_revoked(self) -> bool:
        return self.revoked_at is not None

    @property
    def is_expired(self) -> bool:
        # Normalize a possibly-naive expires_at (SQLite reads back naive) to UTC
        # so the comparison never raises "can't compare offset-naive and
        # offset-aware datetimes".
        expires = self.expires_at
        if expires.tzinfo is None:
            expires = expires.replace(tzinfo=timezone.utc)
        return datetime.now(timezone.utc) > expires
