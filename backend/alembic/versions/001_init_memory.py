"""init memory tables

Revision ID: 001_init_memory
Revises:
Create Date: 2026-07-22
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

revision: str = "001_init_memory"
down_revision: Union[str, None] = None
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "memory_items",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("user_id", sa.Integer(), nullable=False),
        sa.Column("layer", sa.String(20), nullable=False),
        sa.Column("kind", sa.String(20), nullable=False),
        sa.Column("depth", sa.String(20), nullable=False),
        sa.Column("content", sa.Text(), nullable=False),
        sa.Column("surface_text", sa.Text(), nullable=False, server_default=""),
        sa.Column("confidence", sa.Float(), nullable=False, server_default="1.0"),
        sa.Column("version", sa.Integer(), nullable=False, server_default="1"),
        sa.Column("parent_id", sa.Integer(), sa.ForeignKey("memory_items.id"), nullable=True),
        sa.Column("root_id", sa.Integer(), sa.ForeignKey("memory_items.id"), nullable=True),
        sa.Column("is_latest", sa.Boolean(), nullable=False, server_default="1"),
        sa.Column("is_forgotten", sa.Boolean(), nullable=False, server_default="0"),
        sa.Column("forget_reason", sa.String(200), nullable=True),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("relation_type", sa.String(20), nullable=True),
        sa.Column("relation_to_id", sa.Integer(), sa.ForeignKey("memory_items.id"), nullable=True),
        sa.Column("entities", sa.JSON(), nullable=True),
        sa.Column("emotion", sa.JSON(), nullable=True),
        sa.Column("provenance", sa.JSON(), nullable=True),
        sa.Column("visibility_gate", sa.Float(), nullable=False, server_default="0.0"),
        sa.Column("privacy", sa.String(30), nullable=False, server_default="cloud"),
        sa.Column("raw_ref", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_memory_items_user_id", "memory_items", ["user_id"])
    op.create_index("ix_memory_user_layer_latest", "memory_items", ["user_id", "layer", "is_latest"])
    op.create_index("ix_memory_user_kind", "memory_items", ["user_id", "kind"])
    op.create_index("ix_memory_user_depth", "memory_items", ["user_id", "depth"])
    op.create_index("ix_memory_root", "memory_items", ["root_id"])

    op.create_table(
        "memory_history",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("memory_id", sa.Integer(), sa.ForeignKey("memory_items.id"), nullable=False),
        sa.Column("event", sa.String(20), nullable=False),
        sa.Column("actor", sa.String(50), nullable=False, server_default="system"),
        sa.Column("old_content", sa.Text(), nullable=True),
        sa.Column("new_content", sa.Text(), nullable=True),
        sa.Column("meta", sa.JSON(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_memory_history_memory_id", "memory_history", ["memory_id"])


def downgrade() -> None:
    op.drop_table("memory_history")
    op.drop_table("memory_items")
