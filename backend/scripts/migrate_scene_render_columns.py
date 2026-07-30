"""【已退役】一次性迁移：给已存在的 scenes 表补 DAY-209 渲染列。

⚠️ 正式迁移已纳入 alembic：backend/alembic/versions/013_scene_render_columns.py，
生产/新环境请直接 `uv run alembic upgrade head`，不要再跑本脚本。
仅保留给无法跑 alembic 的旧 dev 库应急（幂等，只 ADD COLUMN）。

用法（在 backend 目录下）：
    uv run python scripts/migrate_scene_render_columns.py
"""
from sqlalchemy import text

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))  # 让 app 包可导入（backend 根）

from app.db import engine

# 列名 -> SQLite ADD COLUMN DDL 片段（与 app/models/scene.py 定义对齐）
# render_kind 为 NOT NULL，用 DEFAULT 兜底旧行；其余可空。
_COLUMNS: dict[str, str] = {
    "render_kind": "VARCHAR(20) NOT NULL DEFAULT 'preset_3d'",
    "theater_id": "VARCHAR(40)",
    "bg_image": "VARCHAR(255)",
    "characters": "JSON",
}


def _existing_columns(conn) -> set[str]:
    rows = conn.execute(text("PRAGMA table_info(scenes)")).fetchall()
    return {r[1] for r in rows}  # r = (cid, name, type, notnull, dflt_value, pk)


def main() -> None:
    print(f"[migrate] target DB: {engine.url}")
    with engine.begin() as conn:
        tables = conn.execute(
            text("SELECT name FROM sqlite_master WHERE type='table' AND name='scenes'")
        ).fetchall()
        if not tables:
            print("[migrate] scenes 表不存在——请先 create_all 建库；无需迁移。")
            return

        existing = _existing_columns(conn)
        added, skipped = [], []
        for col, ddl in _COLUMNS.items():
            if col in existing:
                skipped.append(col)
                continue
            conn.execute(text(f"ALTER TABLE scenes ADD COLUMN {col} {ddl}"))
            added.append(col)

    print(f"[migrate] 已补列: {added or '（无）'}")
    print(f"[migrate] 已存在跳过: {skipped or '（无）'}")
    print("[migrate] 完成。")


if __name__ == "__main__":
    main()
