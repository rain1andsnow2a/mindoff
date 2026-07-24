"""create scenes table

Revision ID: 009_scenes
Revises: 008_users_handoffs
Create Date: 2026-07-23
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "009_scenes"
down_revision: Union[str, None] = "008_field_ext"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "scenes",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("user_id", sa.Integer(), nullable=False),
        sa.Column("title", sa.String(length=200), nullable=False, server_default=""),
        sa.Column("status", sa.String(length=20), nullable=False, server_default="active"),
        sa.Column("source_fragment_id", sa.Integer(), nullable=True),
        sa.Column("setting", sa.Text(), nullable=False, server_default=""),
        sa.Column("beats", sa.JSON(), nullable=True),
        sa.Column("choices", sa.JSON(), nullable=True),
        sa.Column("history", sa.JSON(), nullable=True),
        sa.Column("turn", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_scenes_user_id", "scenes", ["user_id"])


def downgrade() -> None:
    op.drop_index("ix_scenes_user_id", table_name="scenes")
    op.drop_table("scenes")
