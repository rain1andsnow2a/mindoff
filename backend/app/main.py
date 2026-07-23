"""MindOff 后端入口：AI 网关 + 双轴记忆系统。

启动：cd backend && uv run uvicorn app.main:app --reload
"""
import asyncio
import logging
from contextlib import asynccontextmanager
from datetime import datetime, timedelta, timezone

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.config import get_settings
from app.db import Base, engine
from app.routers import (
    auth,
    brain_dumps,
    chat,
    conversations,
    debug,
    ephemeral,
    handoffs,
    letters,
    mailbox,
    memory,
    memory_review,
    pets,
    realtime,
    reminders,
    stores,
    stt,
    treasures,
)

settings = get_settings()
logger = logging.getLogger(__name__)

# 做梦 Agent 定时触发时间（默认凌晨 0 点）
DREAM_HOUR = 0
DREAM_MINUTE = 0


async def _dream_scheduler():
    """后台协程：每天 DREAM_HOUR:DREAM_MINUTE 触发做梦 Agent。"""
    while True:
        now = datetime.now(timezone.utc)
        target = now.replace(hour=DREAM_HOUR, minute=DREAM_MINUTE, second=0, microsecond=0)
        if target <= now:
            target += timedelta(days=1)
        wait_seconds = (target - now).total_seconds()
        logger.info("[scheduler] next dream run in %.0f seconds", wait_seconds)
        await asyncio.sleep(wait_seconds)

        if settings.dreaming_enabled:
            from app.db import SessionLocal
            from app.graphs.dreaming import run_dreaming_all

            db = SessionLocal()
            try:
                results = run_dreaming_all(db)
                logger.info("[scheduler] dream done: %d users", len(results))
            except Exception as e:
                logger.error("[scheduler] dream failed: %s", e)
            finally:
                db.close()


@asynccontextmanager
async def lifespan(app: FastAPI):
    # 启动时确保表存在（开发期；生产走 Alembic）
    Base.metadata.create_all(bind=engine)
    # 启动做梦定时调度
    task = asyncio.create_task(_dream_scheduler())
    yield
    task.cancel()


app = FastAPI(title="MindOff Backend", version="0.3.0", lifespan=lifespan)

_origins = [o.strip() for o in settings.cors_origins.split(",") if o.strip()] or ["*"]
app.add_middleware(
    CORSMiddleware,
    allow_origins=_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# AI 网关
app.include_router(chat.router)
app.include_router(stt.router)
app.include_router(realtime.router)

# 业务层：账号
app.include_router(auth.router)

# 业务层：交接信
app.include_router(handoffs.router)

# 业务层：桌宠（PUT /pets/active 切换时触发交接信生成）
app.include_router(pets.router)

# 业务层：记忆系统
app.include_router(memory.router)
app.include_router(brain_dumps.router)
app.include_router(mailbox.router)

# 业务层：对话
app.include_router(conversations.router)

# 业务层：五类存储（待办/小结/灵感/情绪）
app.include_router(stores.todos_router)
app.include_router(stores.summaries_router)
app.include_router(stores.ideas_router)
app.include_router(stores.emotions_router)

# 业务层：信箱扩展（来信/三日寄存/长久珍藏）
app.include_router(letters.router)
app.include_router(ephemeral.router)
app.include_router(treasures.router)

# 业务层：记忆审阅控制面（我的·记忆）
app.include_router(memory_review.router)

# 业务层：主动提醒（待办到期桌宠提醒）
app.include_router(reminders.router)

# 调试：做梦 Agent 手动触发
app.include_router(debug.router)


@app.get("/health")
async def health():
    """存活检查。只报告 key 是否已加载（布尔），绝不回显 key 本身。"""
    s = get_settings()
    return {
        "status": "ok",
        "stepfun_key_loaded": bool(s.stepfun_api_key),
        "text_model": s.step_text_model,
        "asr_stream_model": s.step_asr_stream_model,
        "realtime_model": s.step_realtime_model,
        "dreaming_enabled": s.dreaming_enabled,
        "proactive_enabled": s.proactive_enabled,
    }
