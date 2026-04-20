"""add_aws_credentials_table

Revision ID: b3f2a1c8d905
Revises: ea55dc1219d7
Create Date: 2026-04-20 12:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'b3f2a1c8d905'
down_revision: Union[str, None] = 'ea55dc1219d7'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        'aws_credentials',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('user_id', sa.Integer(), nullable=False),
        sa.Column('encrypted_access_key_id', sa.String(), nullable=False),
        sa.Column('encrypted_secret_access_key', sa.String(), nullable=False),
        sa.Column('region', sa.String(), nullable=False, server_default='us-east-1'),
        sa.Column('label', sa.String(), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.ForeignKeyConstraint(['user_id'], ['users.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('user_id', name='uq_aws_credentials_user_id'),
    )
    op.create_index('ix_aws_credentials_id', 'aws_credentials', ['id'], unique=False)


def downgrade() -> None:
    op.drop_index('ix_aws_credentials_id', table_name='aws_credentials')
    op.drop_table('aws_credentials')
