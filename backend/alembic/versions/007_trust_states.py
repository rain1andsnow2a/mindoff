"""create trust_states table

Revision ID: 007_trust_states
Revises: 006_role_profiles
Create Date: 2026-07-23
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

revision: str = "007_trust_states"
down_revision: Union[str, None] = "006_role_profiles"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "trust_states",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("user_id", sa.Integer(), nullable=False),
        sa.Column("value", sa.Float(), nullable=False, server_default="0"),
        sa.Column("interactions", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("confirms", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("denies", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("proactive_enabled", sa.Boolean(), nullable=False, server_default=sa.true()),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("user_id"),
    )
    op.create_index("ix_trust_states_user_id", "trust_states", ["user_id"])


def downgrade() -> None:
    op.drop_index("ix_trust_states_user_id", table_name="trust_states")
    op.drop_table("trust_states")
