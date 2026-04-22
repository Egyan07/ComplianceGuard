"""Add index on evidence_collections.user_id

Revision ID: 8b2e7c1d5a19
Revises: 7a1c4f9b2d08
Create Date: 2026-04-22 13:15:00.000000

Every evidence query filters on user_id; without an index this was a full
table scan. On a fleet of a few hundred users this was fine, at SaaS scale
it's load-bearing.
"""
from typing import Sequence, Union

from alembic import op


# revision identifiers, used by Alembic.
revision: str = '8b2e7c1d5a19'
down_revision: Union[str, None] = '7a1c4f9b2d08'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_index(
        "ix_evidence_collections_user_id",
        "evidence_collections",
        ["user_id"],
    )


def downgrade() -> None:
    op.drop_index(
        "ix_evidence_collections_user_id",
        table_name="evidence_collections",
    )
