"""add_machines_table

Revision ID: 2b7e3f4a9c1d
Revises: ea55dc1219d7
Create Date: 2026-04-17 10:00:00.000000

"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa


revision: str = '2b7e3f4a9c1d'
down_revision: Union[str, None] = 'ea55dc1219d7'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        'machines',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('user_id', sa.Integer(), sa.ForeignKey('users.id'), nullable=False),
        sa.Column('hostname', sa.String(), nullable=False),
        sa.Column('os_version', sa.String(), nullable=True),
        sa.Column('last_score', sa.Float(), nullable=True),
        sa.Column('compliance_level', sa.String(), nullable=True),
        sa.Column('evidence_count', sa.Integer(), nullable=True),
        sa.Column('agent_version', sa.String(), nullable=True),
        sa.Column('last_sync_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('is_active', sa.Boolean(), nullable=False, server_default='1'),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('user_id', 'hostname', name='uq_machine_user_hostname'),
    )
    op.create_index('ix_machines_id', 'machines', ['id'], unique=False)
    op.create_index('ix_machines_user_id', 'machines', ['user_id'], unique=False)


def downgrade() -> None:
    op.drop_index('ix_machines_user_id', table_name='machines')
    op.drop_index('ix_machines_id', table_name='machines')
    op.drop_table('machines')
