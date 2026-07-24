"""create user_preferences table

Revision ID: 009_user_prefs
Revises: 008_field_ext
Create Date: 2026-07-23
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

revision: str = "009_user_prefs"
down_revision: Union[str, None] = "008_field_ext"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "user_preferences",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("user_id", sa.Integer(), nullable=False),
        sa.Column("proactive_enabled", sa.Boolean(), nullable=False, server_default=sa.true()),
        sa.Column("proactive_frequency", sa.String(20), nullable=False, server_default="温和"),
        sa.Column("sleep_reminder_time", sa.String(5), nullable=False, server_default="22:30"),
        sa.Column("keep_raw_dump", sa.Boolean(), nullable=False, server_default=sa.true()),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("user_id"),
    )
    op.create_index("ix_user_preferences_user_id", "user_preferences", ["user_id"])


def downgrade() -> None:
    op.drop_index("ix_user_preferences_user_id", table_name="user_preferences")
    op.drop_table("user_preferences")
