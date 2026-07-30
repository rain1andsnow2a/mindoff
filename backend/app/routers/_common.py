"""路由层公共小工具：SSE 帧格式化与「按登录用户取属主场景」。

抽出以消除 scenes.py / candidates.py / theater_ext.py 里的重复实现。
"""
from __future__ import annotations

import json

from fastapi import HTTPException, status
from sqlalchemy.orm import Session

from app.models.scene import Scene


def sse(event: str, data: dict) -> str:
    """格式化一帧 SSE：`event: <name>\\ndata: <json>\\n\\n`（中文不转义）。"""
    return f"event: {event}\ndata: {json.dumps(data, ensure_ascii=False)}\n\n"


def get_owned_scene(db: Session, user_id: int, scene_id: int) -> Scene:
    """取属于该用户的场景；不存在或非本人时抛 404。"""
    s = db.get(Scene, scene_id)
    if s is None or s.user_id != user_id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "场景不存在")
    return s
