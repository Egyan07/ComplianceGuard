"""Add refresh-token family_id for rotation & reuse detection

Revision ID: c9d2e4f6a8b0
Revises: a7b8c9d0e1f2
Create Date: 2026-08-16 12:00:00.000000

Phase 11 (I): refresh tokens are now rotated on every /auth/refresh — the
presented token is revoked and a new one is issued within the same FAMILY.
Presenting an already-rotated token (replay/reuse) revokes the whole family,
forcing reauthentication. Existing rows get family_id NULL and are treated as
pre-rotation tokens: they still validate for one refresh, which promotes them
into a fresh family.
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "c9d2e4f6a8b0"
down_revision: Union[str, None] = "a7b8c9d0e1f2"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("refresh_tokens", sa.Column("family_id", sa.String(64), nullable=True))
    op.create_index("ix_refresh_tokens_family_id", "refresh_tokens", ["family_id"])


def downgrade() -> None:
    op.drop_index("ix_refresh_tokens_family_id", table_name="refresh_tokens")
    op.drop_column("refresh_tokens", "family_id")
