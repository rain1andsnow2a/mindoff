"""create role_profiles table

Revision ID: 006_role_profiles
Revises: 005_mailbox_ext
Create Date: 2026-07-23
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

revision: str = "006_role_profiles"
down_revision: Union[str, None] = "005_mailbox_ext"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "role_profiles",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("user_id", sa.Integer(), nullable=False),
        sa.Column("name", sa.String(100), nullable=False),
        sa.Column("relation", sa.String(100), nullable=False, server_default=""),
        sa.Column("notes", sa.Text(), nullable=False, server_default=""),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_role_profiles_user_id", "role_profiles", ["user_id"])


def downgrade() -> None:
    op.drop_index("ix_role_profiles_user_id", table_name="role_profiles")
    op.drop_table("role_profiles")
