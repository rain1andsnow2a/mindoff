"""add pets.system_prompt

Revision ID: 011_pet_system_prompt
Revises: 010_pref_ext
Create Date: 2026-07-24
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

revision: str = "011_pet_system_prompt"
down_revision: Union[str, None] = "010_pref_ext"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("pets", sa.Column("system_prompt", sa.Text(), nullable=True))


def downgrade() -> None:
    op.drop_column("pets", "system_prompt")
