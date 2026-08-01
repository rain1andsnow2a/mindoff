"""add content_signals observation table

Revision ID: 015_content_signals
Revises: 014_scene_spec
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "015_content_signals"
down_revision: Union[str, None] = "014_scene_spec"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "content_signals",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column("user_id", sa.Integer(), nullable=False),
        sa.Column("source_type", sa.String(30), nullable=False),
        sa.Column("source_id", sa.String(100), nullable=False),
        sa.Column("source_hash", sa.String(64), nullable=False),
        sa.Column("topics", sa.JSON(), nullable=False),
        sa.Column("entities", sa.JSON(), nullable=False),
        sa.Column("intent", sa.String(30), nullable=False, server_default="other"),
        sa.Column("events", sa.JSON(), nullable=False),
        sa.Column("state", sa.JSON(), nullable=False),
        sa.Column("repetition_key", sa.String(160), nullable=True),
        sa.Column("emotion", sa.JSON(), nullable=True),
        sa.Column("confidence", sa.Float(), nullable=False, server_default="0.5"),
        sa.Column("sensitivity", sa.String(20), nullable=False, server_default="surface"),
        sa.Column("extraction_status", sa.String(20), nullable=False, server_default="ready"),
        sa.Column("extraction_error", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.UniqueConstraint("user_id", "source_type", "source_id", "source_hash", name="uq_content_signal_source"),
    )
    op.create_index("ix_content_signals_user_id", "content_signals", ["user_id"])
    op.create_index("ix_content_signal_user_created", "content_signals", ["user_id", "created_at"])
    op.create_index("ix_content_signal_user_repeat", "content_signals", ["user_id", "repetition_key"])


def downgrade() -> None:
    op.drop_table("content_signals")

