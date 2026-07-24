"""一次性迁移：给已存在的 scenes 表补 DAY-209 渲染列。

背景：dev 用 SQLite + create_all，create_all 只建新表、不会给旧表 ALTER 加列，
所以早于 DAY-209 建的库缺 render_kind/theater_id/bg_image/characters 四列，
dynamic_image galgame 落库会报错。本脚本按需补列，幂等可重复跑。

用法（在 backend 目录下）：
    uv run python scripts/migrate_scene_render_columns.py
    # 或指定库： set DATABASE_URL=sqlite:///./mindoff.db && uv run python scripts/...

只做 ADD COLUMN（非破坏性）：已存在的列自动跳过，不改数据、不删列。
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
