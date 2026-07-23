"""MindOff AI 网关入口。

启动：cd backend && uv run uvicorn app.main:app --reload
"""
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.config import get_settings
from app.routers import chat, realtime, stt

settings = get_settings()

app = FastAPI(title="MindOff AI Gateway", version="0.1.0")

_origins = [o.strip() for o in settings.cors_origins.split(",") if o.strip()] or ["*"]
app.add_middleware(
    CORSMiddleware,
    allow_origins=_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(chat.router)
app.include_router(stt.router)
app.include_router(realtime.router)


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
    }
