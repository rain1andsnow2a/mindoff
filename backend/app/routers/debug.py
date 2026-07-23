"""Debug / 调度端点。

POST /api/v1/debug/dream → 手动触发做梦 Agent（演示用，无需等凌晨）。
"""
from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.db import get_db
from app.deps import get_current_user
from app.models.user import User

router = APIRouter(prefix="/api/v1/debug", tags=["debug"])


@router.post("/dream")
def trigger_dream(
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """手动触发当前用户的做梦 Agent（黑客松演示用）。"""
    from app.graphs.dreaming import run_dreaming

    result = run_dreaming(db, user.id)
    return result


@router.post("/dream-all")
def trigger_dream_all(db: Session = Depends(get_db)):
    """手动触发所有活跃用户的做梦（定时任务模拟）。"""
    from app.graphs.dreaming import run_dreaming_all

    results = run_dreaming_all(db)
    return {"results": results}
