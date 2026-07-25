#!/usr/bin/env bash
# 容器入口：先把数据库弄对，再起 uvicorn。
#
# 三种情况：
# 1. 库不存在            → create_all 建全量表 + alembic stamp head
# 2. 库存在但无版本记录  → alembic stamp head（历史上被 create_all 建过）
# 3. 库存在且有版本记录  → alembic upgrade head 跑增量迁移
#
# 与 AGENTS.md「dev 库由 create_all 建、模型变更必须同步写迁移」口径一致：
# 线上首次用 create_all 落基线，之后的字段变更全部靠 alembic。
set -euo pipefail

DB_FILE="${MINDOFF_DB_FILE:-/data/mindoff.db}"

if [ ! -f "$DB_FILE" ]; then
  echo "[entrypoint] 库不存在：create_all 建表"
  python - <<'PY'
from app.db import Base, engine
import app.models  # noqa: F401  注册全部模型
Base.metadata.create_all(bind=engine)
print("[entrypoint] create_all done")
PY
  alembic stamp head
  echo "[entrypoint] stamped head"
else
  HAS_VERSION=$(python - <<'PY'
from sqlalchemy import inspect
from app.db import engine
print("yes" if "alembic_version" in inspect(engine).get_table_names() else "no")
PY
)
  if [ "$HAS_VERSION" = "no" ]; then
    echo "[entrypoint] 库已存在但无 alembic_version：补建缺失表 + stamp head"
    python - <<'PY'
from app.db import Base, engine
import app.models  # noqa: F401
Base.metadata.create_all(bind=engine)   # checkfirst=True，已存在的表不动
print("[entrypoint] create_all (idempotent) done")
PY
    alembic stamp head
  else
    echo "[entrypoint] alembic upgrade head"
    alembic upgrade head
  fi
fi

exec "$@"
