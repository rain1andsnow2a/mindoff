"""偏好设置 REST 接口（api-design §10）。

GET   /api/v1/preferences  读取（不存在时按默认创建）
PATCH /api/v1/preferences  部分修改（频率档位/开关/睡前提醒时间/隐私）

`proactive_enabled` 同步写入 TrustState（信任门控从那边读，requirements 6.5）。
"""
import re
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.db import get_db
from app.deps import get_current_user
from app.models.preference import UserPreference
from app.models.user import User
from app.services import trust as trust_service

router = APIRouter(prefix="/api/v1/preferences", tags=["preferences"])

FREQUENCIES = ("安静", "温和", "活跃")
_TIME_RE = re.compile(r"^([01]\d|2[0-3]):[0-5]\d$")


def _get_or_create(db: Session, user_id: int) -> UserPreference:
    pref = db.scalar(select(UserPreference).where(UserPreference.user_id == user_id))
    if pref is None:
        pref = UserPreference(user_id=user_id)
        db.add(pref)
        db.commit()
        db.refresh(pref)
    return pref


class PreferenceOut(BaseModel):
    proactive_enabled: bool
    proactive_frequency: str
    sleep_reminder_time: str
    keep_raw_dump: bool
    ephemeral_ttl_days: int
    font_size: str
    companion_tone: str
    reduce_transparency: bool

    model_config = {"from_attributes": True}


class PreferencePatch(BaseModel):
    proactive_enabled: bool | None = None
    proactive_frequency: str | None = Field(default=None)
    sleep_reminder_time: str | None = None
    keep_raw_dump: bool | None = None
    ephemeral_ttl_days: int | None = None
    font_size: str | None = None
    companion_tone: str | None = None
    reduce_transparency: bool | None = None


@router.get("", response_model=PreferenceOut)
def get_preferences(
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    return _get_or_create(db, user.id)


@router.patch("", response_model=PreferenceOut)
def patch_preferences(
    body: PreferencePatch,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    pref = _get_or_create(db, user.id)
    patch = body.model_dump(exclude_none=True)
    if not patch:
        raise HTTPException(400, "No fields to update")

    if "proactive_frequency" in patch:
        if patch["proactive_frequency"] not in FREQUENCIES:
            raise HTTPException(422, f"频率档位须为 {'/'.join(FREQUENCIES)}")
    if "sleep_reminder_time" in patch:
        if not _TIME_RE.match(patch["sleep_reminder_time"]):
            raise HTTPException(422, "时间格式须为 HH:MM")
    if "ephemeral_ttl_days" in patch:
        if not 1 <= patch["ephemeral_ttl_days"] <= 30:
            raise HTTPException(422, "寄存天数须在 1–30 天之间")
    if "font_size" in patch:
        if patch["font_size"] not in ("小", "标准", "大"):
            raise HTTPException(422, "字体须为 小/标准/大")

    for k, v in patch.items():
        setattr(pref, k, v)
    db.commit()
    db.refresh(pref)

    # 主动陪伴总开关同步到信任状态（门控读 TrustState）
    if "proactive_enabled" in patch:
        trust_service.set_proactive_enabled(db, user.id, patch["proactive_enabled"])

    return pref


class LocationIn(BaseModel):
    lat: float = Field(ge=-90, le=90)
    lon: float = Field(ge=-180, le=180)
    city: str | None = None


@router.post("/location")
def report_location(
    body: LocationIn,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """前端上报最近一次模糊位置（供天气/环境上下文）。只存最近一次，不存轨迹。"""
    pref = _get_or_create(db, user.id)
    pref.last_lat = body.lat
    pref.last_lon = body.lon
    if body.city:
        pref.last_city = body.city
    pref.location_updated_at = datetime.now(timezone.utc)
    db.commit()
    return {"ok": True, "city": pref.last_city}
