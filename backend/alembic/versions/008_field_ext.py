"""letter attachment + role_profile structured fields

Revision ID: 008_field_ext
Revises: 007_trust_states
Create Date: 2026-07-23
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

revision: str = "008_field_ext"
down_revision: Union[str, None] = "007_trust_states"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # letters.attachment（"信里夹了一首歌"附件卡载荷）
    op.add_column("letters", sa.Column("attachment", sa.JSON(), nullable=True))
    # role_profiles 结构化设定字段
    op.add_column("role_profiles", sa.Column("personality_summary", sa.Text(), nullable=False, server_default=""))
    op.add_column("role_profiles", sa.Column("speaking_style", sa.String(300), nullable=False, server_default=""))
    op.add_column("role_profiles", sa.Column("conflict_response", sa.String(300), nullable=False, server_default=""))
    op.add_column("role_profiles", sa.Column("traits", sa.JSON(), nullable=True))


def downgrade() -> None:
    op.drop_column("role_profiles", "traits")
    op.drop_column("role_profiles", "conflict_response")
    op.drop_column("role_profiles", "speaking_style")
    op.drop_column("role_profiles", "personality_summary")
    op.drop_column("letters", "attachment")
