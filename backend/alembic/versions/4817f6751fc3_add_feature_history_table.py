"""add feature_history table

Revision ID: 4817f6751fc3
Revises: 8295fb234116
Create Date: 2026-08-01 10:48:39.133662

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
import geoalchemy2


# revision identifiers, used by Alembic.
revision: str = '4817f6751fc3'
down_revision: Union[str, None] = '8295fb234116'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "feature_history",
        sa.Column("id", sa.Integer(), primary_key=True, index=True),
        sa.Column("feature_id", sa.Integer(), nullable=False, index=True),
        sa.Column("layer_id", sa.Integer(), sa.ForeignKey("layers.id"), nullable=False),
        sa.Column("action", sa.String(length=20), nullable=False),
        sa.Column("properties_before", sa.JSON(), nullable=True),
        sa.Column("properties_after", sa.JSON(), nullable=True),
        sa.Column("changed_by_id", sa.Integer(), sa.ForeignKey("users.id"), nullable=True),
        sa.Column("changed_at", sa.DateTime(), nullable=False, server_default=sa.func.now()),
    )


def downgrade() -> None:
    op.drop_table("feature_history")