"""应用版本信息（公开接口，App 启动检查更新用，无需登录）。

发版时只改 backend/app/app_version.json（latest + changelog + apk_url），随 deploy 同步生效；
不落库、不需管理后台。前端用本地包版本与 latest 语义化比较，决定是否提示更新。
本接口是极少数「不加 get_current_user」的公开接口：只返回发布元信息，不涉及任何用户数据。
"""
import json
from pathlib import Path

from fastapi import APIRouter

router = APIRouter(prefix="/api/v1/app", tags=["app"])

# app_version.json 在 backend/app/ 下（本文件在 app/routers/system/，向上三级到 app/）
_VERSION_FILE = Path(__file__).resolve().parents[2] / "app_version.json"


@router.get("/version")
def app_version() -> dict:
    """返回最新发布信息：latest / min_supported / apk_url / size_mb / changelog。

    读取失败时返回保守默认（latest=0.0.0，前端据此判定「无更新」不打扰用户）。
    """
    try:
        data = json.loads(_VERSION_FILE.read_text(encoding="utf-8"))
    except (OSError, ValueError):
        data = {}
    return {
        "latest": str(data.get("latest") or "0.0.0"),
        "min_supported": str(data.get("min_supported") or "0.0.0"),
        "apk_url": str(data.get("apk_url") or ""),
        "size_mb": data.get("size_mb"),
        "changelog": data.get("changelog") or [],
    }
