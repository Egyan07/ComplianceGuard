"""Add index on refresh_tokens.expires_at for efficient cleanup queries

Revision ID: f1d8a3c2e047
Revises: a3f9e2b1c6d4
Create Date: 2026-04-26 18:00:00.000000

The hourly background task that deletes expired refresh tokens executes:

    DELETE FROM refresh_tokens WHERE expires_at < NOW()

Without an index on ``expires_at`` this is a full table scan under a write
lock on every run. On a busy instance with thousands of token rows this
scan will be slow and will block concurrent reads.

This migration adds a plain (non-unique) index on ``expires_at`` so the
cleanup query and any other range filters on that column use an index seek.
"""
from typing import Sequence, Union

from alembic import op


revision: str = 'f1d8a3c2e047'
down_revision: Union[str, None] = 'a3f9e2b1c6d4'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_index(
        "ix_refresh_tokens_expires_at",
        "refresh_tokens",
        ["expires_at"],
        unique=False,
    )


def downgrade() -> None:
    op.drop_index("ix_refresh_tokens_expires_at", table_name="refresh_tokens")
