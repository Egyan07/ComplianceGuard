"""add unique constraint on audit_log.prev_hash

Prevents two concurrent audit appends from forking the hash chain by both
claiming the same predecessor. NULL (genesis) is exempt — SQL treats NULLs as
distinct under a unique constraint.

Revision ID: a7b8c9d0e1f2
Revises: 3cef531bbe2e
Create Date: 2026-06-08
"""
from typing import Sequence, Union

from alembic import op

# revision identifiers, used by Alembic.
revision: str = "a7b8c9d0e1f2"
down_revision: Union[str, None] = "3cef531bbe2e"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # batch_alter_table so this works on SQLite (table recreate) and Postgres.
    with op.batch_alter_table("audit_log") as batch_op:
        batch_op.create_unique_constraint("uq_audit_log_prev_hash", ["prev_hash"])


def downgrade() -> None:
    with op.batch_alter_table("audit_log") as batch_op:
        batch_op.drop_constraint("uq_audit_log_prev_hash", type_="unique")
