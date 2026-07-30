"""scenes: add scene_spec column (generated_3d 的 SceneSpec JSON)

Revision ID: 014_scene_spec
Revises: 013_scene_render_columns
Create Date: 2026-07-30

generated_3d 渲染方式把 LLM 产出的 SceneSpec（env/props/characters/lighting/camera）
存进 scenes.scene_spec，前端 assembleScene 据此程序化拼装低多边形 3D 场景。
幂等：已存在则跳过。
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "014_scene_spec"
down_revision: Union[str, None] = "013_scene_render_columns"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def _has_column(table: str, column: str) -> bool:
    bind = op.get_bind()
    insp = sa.inspect(bind)
    return column in {c["name"] for c in insp.get_columns(table)}


def upgrade() -> None:
    if not _has_column("scenes", "scene_spec"):
        op.add_column("scenes", sa.Column("scene_spec", sa.JSON(), nullable=True))


def downgrade() -> None:
    if _has_column("scenes", "scene_spec"):
        op.drop_column("scenes", "scene_spec")
