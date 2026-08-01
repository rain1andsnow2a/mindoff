"""profile consolidation tracking and learning preference

Revision ID: 016_profile_learning
Revises: 015_content_signals
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "016_profile_learning"
down_revision: Union[str, None] = "015_content_signals"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("content_signals", sa.Column("profile_memory_id", sa.Integer(), nullable=True))
    op.add_column("content_signals", sa.Column("profiled_at", sa.DateTime(timezone=True), nullable=True))
    op.create_index("ix_content_signals_profile_memory_id", "content_signals", ["profile_memory_id"])
    op.add_column(
        "user_preferences",
        sa.Column("profile_learning_enabled", sa.Boolean(), nullable=False, server_default=sa.true()),
    )


def downgrade() -> None:
    op.drop_column("user_preferences", "profile_learning_enabled")
    op.drop_index("ix_content_signals_profile_memory_id", table_name="content_signals")
    op.drop_column("content_signals", "profiled_at")
    op.drop_column("content_signals", "profile_memory_id")
