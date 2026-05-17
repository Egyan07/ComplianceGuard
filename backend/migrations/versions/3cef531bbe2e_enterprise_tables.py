"""enterprise_tables

Revision ID: 3cef531bbe2e
Revises: f1d8a3c2e047
Create Date: 2026-05-17 14:00:58.418069

"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision: str = '3cef531bbe2e'
down_revision: Union[str, None] = 'f1d8a3c2e047'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade():
    op.create_table(
        "audit_log",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("event_type", sa.String(), nullable=False),
        sa.Column("user_id", sa.Integer(), sa.ForeignKey("users.id", ondelete="SET NULL"), nullable=True),
        sa.Column("framework", sa.String(), nullable=True),
        sa.Column("score", sa.Float(), nullable=True),
        sa.Column("detail_json", sa.JSON(), nullable=True),
        sa.Column("prev_hash", sa.String(64), nullable=True),
        sa.Column("entry_hash", sa.String(64), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )

    op.create_table(
        "enterprise_config",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("company_name", sa.String(), nullable=False),
        sa.Column("logo_base64", sa.Text(), nullable=True),
        sa.Column("report_footer", sa.String(), nullable=True),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )

    op.create_table(
        "user_roles",
        sa.Column("user_id", sa.Integer(), sa.ForeignKey("users.id", ondelete="CASCADE"), primary_key=True),
        sa.Column("role", sa.String(), nullable=False),
        sa.Column("assigned_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )

    # Seed first admin from earliest-created user (if any exist)
    op.execute("""
        INSERT INTO user_roles (user_id, role)
        SELECT id, 'admin' FROM users ORDER BY created_at ASC, id ASC LIMIT 1
        ON CONFLICT DO NOTHING
    """)

    # Revoke DELETE and UPDATE on audit_log for the app user (Postgres only)
    bind = op.get_bind()
    if bind.dialect.name == "postgresql":
        op.execute("REVOKE DELETE, UPDATE ON audit_log FROM PUBLIC")


def downgrade():
    bind = op.get_bind()
    if bind.dialect.name == "postgresql":
        op.execute("GRANT DELETE, UPDATE ON audit_log TO PUBLIC")
    op.drop_table("user_roles")
    op.drop_table("enterprise_config")
    op.drop_table("audit_log")
