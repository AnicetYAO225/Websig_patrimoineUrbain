"""add source metadata columns to layers

Revision ID: 0003
Revises: 0002
Create Date: 2026-07-24

"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "0003"
down_revision: Union[str, None] = "0002"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("layers", sa.Column("source", sa.String(length=200), nullable=True))
    op.add_column("layers", sa.Column("source_date", sa.String(length=20), nullable=True))
    op.add_column("layers", sa.Column("license", sa.String(length=200), nullable=True))


def downgrade() -> None:
    op.drop_column("layers", "license")
    op.drop_column("layers", "source_date")
    op.drop_column("layers", "source")
