"""应用版本信息（公开接口，App 启动检查更新用，无需登录）。

仓库内 app_version.json 是构建时兜底；APK 发布脚本会把已校验的运行时清单原子写入
static/download/app_version.json。前端用本地包版本与 latest 语义化比较，决定是否提示更新。
本接口是极少数「不加 get_current_user」的公开接口：只返回发布元信息，不涉及任何用户数据。
"""
import json
from pathlib import Path

from fastapi import APIRouter

router = APIRouter(prefix="/api/v1/app", tags=["app"])

# 线上优先读静态卷里的运行时清单：APK 上传完成后才切换清单，不需要重建后端镜像。
_APP_DIR = Path(__file__).resolve().parents[2]
_VERSION_FILE = _APP_DIR / "app_version.json"
_PUBLISHED_VERSION_FILE = _APP_DIR.parent / "static" / "download" / "app_version.json"


def _load_version_data() -> dict:
    for path in (_PUBLISHED_VERSION_FILE, _VERSION_FILE):
        try:
            return json.loads(path.read_text(encoding="utf-8"))
        except (OSError, ValueError, TypeError):
            continue
    return {}


@router.get("/version")
def app_version() -> dict:
    """返回最新发布信息、APK 完整性信息和是否强制更新。

    读取失败时返回保守默认（latest=0.0.0，前端据此判定「无更新」不打扰用户）。
    """
    data = _load_version_data()
    return {
        "latest": str(data.get("latest") or "0.0.0"),
        "min_supported": str(data.get("min_supported") or "0.0.0"),
        "version_code": data.get("version_code"),
        "apk_url": str(data.get("apk_url") or ""),
        "apk_sha256": str(data.get("apk_sha256") or ""),
        "size_bytes": data.get("size_bytes"),
        "size_mb": data.get("size_mb"),
        "mandatory": bool(data.get("mandatory", False)),
        "changelog": data.get("changelog") or [],
    }
