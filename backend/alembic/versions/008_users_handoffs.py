"""create users and handoffs tables

这两张表此前只由 create_all 建（开发期），缺 Alembic 迁移 → 生产 upgrade 会缺表。
本迁移补齐，对齐 app/models/user.py 与 app/models/handoff.py。

Revision ID: 008_users_handoffs
Revises: 007_trust_states
Create Date: 2026-07-23
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "008_users_handoffs"
down_revision: Union[str, None] = "007_trust_states"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "users",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("username", sa.String(length=50), nullable=False),
        sa.Column("email", sa.String(length=255), nullable=True),
        sa.Column("password_hash", sa.String(length=255), nullable=False),
        sa.Column("display_name", sa.String(length=100), nullable=True),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default=sa.true()),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_users_username", "users", ["username"], unique=True)
    op.create_index("ix_users_email", "users", ["email"], unique=True)

    op.create_table(
        "handoffs",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("user_id", sa.Integer(), nullable=False),
        sa.Column("from_pet_id", sa.Integer(), nullable=True),
        sa.Column("to_pet_id", sa.Integer(), nullable=True),
        sa.Column("from_pet_name", sa.String(length=100), nullable=True),
        sa.Column("to_pet_name", sa.String(length=100), nullable=True),
        sa.Column("summary", sa.Text(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_handoffs_user_id", "handoffs", ["user_id"])


def downgrade() -> None:
    op.drop_index("ix_handoffs_user_id", table_name="handoffs")
    op.drop_table("handoffs")
    op.drop_index("ix_users_email", table_name="users")
    op.drop_index("ix_users_username", table_name="users")
    op.drop_table("users")
