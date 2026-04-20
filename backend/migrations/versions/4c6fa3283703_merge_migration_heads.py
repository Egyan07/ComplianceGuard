"""Merge migration heads

Revision ID: 4c6fa3283703
Revises: 2b7e3f4a9c1d, b3f2a1c8d905
Create Date: 2026-04-20 22:31:22.872289

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '4c6fa3283703'
down_revision: Union[str, None] = ('2b7e3f4a9c1d', 'b3f2a1c8d905')
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    pass


def downgrade() -> None:
    pass
