"""create pets table

Revision ID: 004_pets
Revises: 003_kind_fields
Create Date: 2026-07-23
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

revision: str = "004_pets"
down_revision: Union[str, None] = "003_kind_fields"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "pets",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("user_id", sa.Integer(), nullable=False),
        sa.Column("preset_id", sa.String(50), nullable=True),
        sa.Column("name", sa.String(100), nullable=False),
        sa.Column("personality", sa.String(300), nullable=False, server_default=""),
        sa.Column("tone", sa.String(300), nullable=False, server_default=""),
        sa.Column("actions", sa.JSON(), nullable=True),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_pets_user_id", "pets", ["user_id"])


def downgrade() -> None:
    op.drop_index("ix_pets_user_id", table_name="pets")
    op.drop_table("pets")
