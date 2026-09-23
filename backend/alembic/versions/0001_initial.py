"""initial schema: postgis extension + users, layers, features

Revision ID: 0001
Revises:
Create Date: 2026-07-22

"""
from typing import Sequence, Union

import geoalchemy2
import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects.postgresql import JSONB

revision: str = "0001"
down_revision: Union[str, None] = None
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Active l'extension PostGIS sur la base (idempotent)
    op.execute("CREATE EXTENSION IF NOT EXISTS postgis")

    op.create_table(
        "users",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("username", sa.String(length=50), nullable=False),
        sa.Column("email", sa.String(length=255), nullable=False),
        sa.Column("hashed_password", sa.String(length=255), nullable=False),
        sa.Column(
            "role",
            sa.Enum("SUPER_ADMIN", "ADMIN", "AGENT", "CITIZEN", name="userrole"),
            nullable=False,
        ),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default=sa.true()),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
    )
    op.create_index("ix_users_username", "users", ["username"], unique=True)
    op.create_index("ix_users_email", "users", ["email"], unique=True)

    op.create_table(
        "layers",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("name", sa.String(length=100), nullable=False, unique=True),
        sa.Column("slug", sa.String(length=100), nullable=False, unique=True),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column(
            "geometry_type",
            sa.Enum("POINT", "LINESTRING", "POLYGON", name="geometrytype"),
            nullable=False,
        ),
        sa.Column("srid", sa.Integer(), nullable=False, server_default="4326"),
        sa.Column("is_visible", sa.Boolean(), nullable=False, server_default=sa.true()),
        sa.Column("created_by_id", sa.Integer(), sa.ForeignKey("users.id"), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
    )

    op.create_table(
        "features",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("layer_id", sa.Integer(), sa.ForeignKey("layers.id", ondelete="CASCADE"), nullable=False),
        sa.Column(
            "geom",
            geoalchemy2.Geometry(geometry_type="GEOMETRY", srid=4326, spatial_index=False),
            nullable=False,
        ),
        sa.Column("properties", JSONB(), nullable=False, server_default="{}"),
        sa.Column("created_by_id", sa.Integer(), sa.ForeignKey("users.id"), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
    )
    op.create_index("ix_features_layer_id", "features", ["layer_id"])
    # Index spatial GIST : indispensable pour des requêtes ST_Intersects/ST_DWithin performantes
    op.execute("CREATE INDEX idx_features_geom ON features USING GIST (geom)")


def downgrade() -> None:
    op.drop_table("features")
    op.drop_table("layers")
    op.drop_index("ix_users_email", table_name="users")
    op.drop_index("ix_users_username", table_name="users")
    op.drop_table("users")
    op.execute("DROP TYPE IF EXISTS geometrytype")
    op.execute("DROP TYPE IF EXISTS userrole")
