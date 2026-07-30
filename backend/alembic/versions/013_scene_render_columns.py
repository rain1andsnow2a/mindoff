"""scenes: add render columns (render_kind / theater_id / bg_image / characters)

Revision ID: 013_scene_render_columns
Revises: 012_proactive_signals
Create Date: 2026-07-30

模型 Scene 早已加了这 4 列（dev 期靠 create_all / 手工脚本补过），但一直缺
alembic 迁移——生产走 upgrade head 会缺列导致所有 /scenes 接口报错。
这里用 _has_column 幂等补齐，替代 scripts/migrate_scene_render_columns.py。
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "013_scene_render_columns"
down_revision: Union[str, None] = "012_proactive_signals"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def _has_column(table: str, column: str) -> bool:
    bind = op.get_bind()
    insp = sa.inspect(bind)
    return column in {c["name"] for c in insp.get_columns(table)}


def upgrade() -> None:
    columns = [
        # 渲染方式：preset_3d 走前端预置 Three.js 舞台；dynamic_image 走动态 galgame
        sa.Column("render_kind", sa.String(20), nullable=False, server_default="preset_3d"),
        sa.Column("theater_id", sa.String(40), nullable=True),
        sa.Column("bg_image", sa.String(255), nullable=True),
        sa.Column("characters", sa.JSON(), nullable=True),
    ]
    for column in columns:
        if not _has_column("scenes", column.name):
            op.add_column("scenes", column)


def downgrade() -> None:
    for name in ("characters", "bg_image", "theater_id", "render_kind"):
        if _has_column("scenes", name):
            op.drop_column("scenes", name)
