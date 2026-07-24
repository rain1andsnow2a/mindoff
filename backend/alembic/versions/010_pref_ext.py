"""extend user_preferences (ttl/font/tone/transparency)

Revision ID: 010_pref_ext
Revises: 009_scenes
Create Date: 2026-07-24
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

revision: str = "010_pref_ext"
down_revision: Union[str, None] = "009_user_prefs"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("user_preferences", sa.Column("ephemeral_ttl_days", sa.Integer(), nullable=False, server_default="7"))
    op.add_column("user_preferences", sa.Column("font_size", sa.String(10), nullable=False, server_default="标准"))
    op.add_column("user_preferences", sa.Column("companion_tone", sa.String(20), nullable=False, server_default="温和"))
    op.add_column("user_preferences", sa.Column("reduce_transparency", sa.Boolean(), nullable=False, server_default=sa.false()))


def downgrade() -> None:
    op.drop_column("user_preferences", "reduce_transparency")
    op.drop_column("user_preferences", "companion_tone")
    op.drop_column("user_preferences", "font_size")
    op.drop_column("user_preferences", "ephemeral_ttl_days")
