"""Add taxonomy versioning to compliance evaluations.

Revision ID: d7e9f1a3c5b8
Revises: c9d2e4f6a8b0
Create Date: 2026-09-11

Additive only:
  - compliance_evaluations.taxonomy_version  (NULL = pre-versioning legacy row)
  - compliance_evaluations.score_semantics   (NULL = pre-versioning legacy row)

Historical evaluations are NOT rewritten: they are records of what the system
assessed at the time. A NULL taxonomy_version therefore marks rows created
under the legacy (pre-remediation) taxonomy, which lets the UI mark the
taxonomy transition on trend charts without re-scoring anything.
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision: str = "d7e9f1a3c5b8"
down_revision: Union[str, None] = "c9d2e4f6a8b0"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "compliance_evaluations",
        sa.Column("taxonomy_version", sa.String(), nullable=True),
    )
    op.add_column(
        "compliance_evaluations",
        sa.Column("score_semantics", sa.String(), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("compliance_evaluations", "score_semantics")
    op.drop_column("compliance_evaluations", "taxonomy_version")
