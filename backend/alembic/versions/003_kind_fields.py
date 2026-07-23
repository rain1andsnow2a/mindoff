"""add status/due_date to memory_items (todo fields)

Revision ID: 003_kind_fields
Revises: 002_conversations
Create Date: 2026-07-23
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

revision: str = "003_kind_fields"
down_revision: Union[str, None] = "002_conversations"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("memory_items", sa.Column("status", sa.String(20), nullable=True))
    op.add_column("memory_items", sa.Column("due_date", sa.DateTime(timezone=True), nullable=True))


def downgrade() -> None:
    op.drop_column("memory_items", "due_date")
    op.drop_column("memory_items", "status")
