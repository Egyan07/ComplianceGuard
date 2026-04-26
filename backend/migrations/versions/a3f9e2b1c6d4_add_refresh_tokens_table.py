"""Add refresh_tokens table for server-side token revocation

Revision ID: a3f9e2b1c6d4
Revises: 8b2e7c1d5a19
Create Date: 2026-04-26 12:00:00.000000

Adds a ``refresh_tokens`` table that persists every issued refresh token by its
JTI (JWT ID). A token is revoked by setting ``revoked_at``; the refresh endpoint
rejects tokens whose JTI is absent from this table OR is revoked/expired.

This eliminates the previous gap where a stolen refresh token remained valid
until its natural 7-day expiry even after the user logged out.
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = 'a3f9e2b1c6d4'
down_revision: Union[str, None] = '8b2e7c1d5a19'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "refresh_tokens",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("jti", sa.String(64), nullable=False),
        sa.Column(
            "user_id",
            sa.Integer(),
            sa.ForeignKey("users.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("revoked_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
    )
    op.create_index("ix_refresh_tokens_jti", "refresh_tokens", ["jti"], unique=True)
    op.create_index("ix_refresh_tokens_user_id", "refresh_tokens", ["user_id"])


def downgrade() -> None:
    op.drop_index("ix_refresh_tokens_user_id", table_name="refresh_tokens")
    op.drop_index("ix_refresh_tokens_jti", table_name="refresh_tokens")
    op.drop_table("refresh_tokens")
