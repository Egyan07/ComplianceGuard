"""Data model hardening: enum check constraints, Machine.updated_at, nullable ComplianceFramework.company_id

Revision ID: 7a1c4f9b2d08
Revises: 4c6fa3283703
Create Date: 2026-04-22 13:00:00.000000

Changes bundled in this migration:

1. Add a CHECK constraint on ``users.license_tier`` limiting values to
   (free, pro, enterprise). Previously the column was an unconstrained String.
2. Add a CHECK constraint on ``machines.compliance_level`` limiting values to
   (NULL, compliant, at_risk, critical). Previously an unconstrained String.
3. Add ``machines.updated_at`` (mirrors the convention on every other table).
4. Relax ``compliance_frameworks.company_id`` to NULLable. There is currently
   no API to create companies, so inserts against this table always failed
   the NOT NULL check. TODO: flip back to NOT NULL once the company API ships.
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '7a1c4f9b2d08'
down_revision: Union[str, None] = '4c6fa3283703'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Machines: add updated_at and the compliance_level check.
    with op.batch_alter_table("machines") as batch:
        batch.add_column(
            sa.Column(
                "updated_at",
                sa.DateTime(timezone=True),
                server_default=sa.func.now(),
                nullable=False,
            )
        )
        batch.create_check_constraint(
            "ck_machines_compliance_level",
            "compliance_level IS NULL OR compliance_level IN ('compliant', 'at_risk', 'critical')",
        )

    # Users: lock license_tier to the known set.
    with op.batch_alter_table("users") as batch:
        batch.create_check_constraint(
            "ck_users_license_tier",
            "license_tier IN ('free', 'pro', 'enterprise')",
        )

    # ComplianceFramework: relax company_id to nullable until company API exists.
    with op.batch_alter_table("compliance_frameworks") as batch:
        batch.alter_column(
            "company_id",
            existing_type=sa.Integer(),
            nullable=True,
        )


def downgrade() -> None:
    with op.batch_alter_table("compliance_frameworks") as batch:
        batch.alter_column(
            "company_id",
            existing_type=sa.Integer(),
            nullable=False,
        )

    with op.batch_alter_table("users") as batch:
        batch.drop_constraint("ck_users_license_tier", type_="check")

    with op.batch_alter_table("machines") as batch:
        batch.drop_constraint("ck_machines_compliance_level", type_="check")
        batch.drop_column("updated_at")
