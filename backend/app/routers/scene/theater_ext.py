"""片场扩展：场景模板 / 细节补充 / 角色校准（api-design §7.2 + DAY-167 校准要求）。

- GET  /scenes/templates     三个内置模板（对齐前端 BUILT_IN_SCENES）
- PATCH /scenes/{id}         补充细节（标题/设定）
- POST /scenes/{id}/calibrate 「TA 不太像」：用户补充一句 → 校准写入场景设定
  （后续剧情生成即使用校准后设定）+ 回写角色档案（notes 追加 + traits 补充）。
  校准是洞察引擎，不是修 bug——用户被迫把对一个人模糊的印象压缩成清晰语言。
"""
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.db import get_db
from app.deps import get_current_user
from app.graphs import theater
from app.models.role_profile import RoleProfile
from app.models.scene import Scene
from app.models.user import User
from app.routers.system._common import get_owned_scene as _get_owned

router = APIRouter(prefix="/api/v1/scenes", tags=["scenes"])

# ─── 内置模板（与前端 frontend-demo/Scene.tsx 的 BUILT_IN_SCENES 对齐）────────

TEMPLATES = [
    {
        "id": "night-call",
        "title": "深夜通话",
        "desc": "有些话，隔着一通电话才说得出口。",
        "relationships": ["恋人", "朋友", "异地家人"],
        "colors": ["#261A10", "#3A2618", "#4D3828", "#5C4838"],
    },
    {
        "id": "dinner-table",
        "title": "家中餐桌",
        "desc": "最难说出口的话，常常发生在最熟悉的地方。",
        "relationships": ["父母", "家庭", "伴侣"],
        "colors": ["#F5ECD8", "#EDD9BE", "#E2C9A0"],
    },
    {
        "id": "leaving-road",
        "title": "离开的路上",
        "desc": "有些告别，也许还来得及换一种说法。",
        "relationships": ["恋人", "朋友", "同学", "同事"],
        "colors": ["#E8D5C0", "#D9C09E", "#C8A882", "#B89878"],
    },
]


@router.get("/templates")
def list_templates(user: User = Depends(get_current_user)):
    """内置场景模板（前端轮播卡片数据源）。"""
    return TEMPLATES


# ─── 场景整理（自由描述 → 结构化字段）────────────────────────────────────────

class NarrationIn(BaseModel):
    text: str = Field(min_length=1, max_length=2000)


@router.post("/parse")
def parse_narration(
    body: NarrationIn,
    user: User = Depends(get_current_user),
):
    """把用户口述/输入的场景描述整理成「场景整理」页的结构化字段。

    这一步不落库——用户在整理页确认后才 POST /scenes 建正式场景。
    产品红线：只用用户话里已有的信息，没提到的字段留空（前端提示补充），
    「对方性格」只写行为倾向、不贴人格标签。LLM 不可用时 parsed=false 退化返回。
    """
    return theater.parse_narration(body.text)


class RoleParseIn(BaseModel):
    name: str | None = Field(default=None, max_length=40)
    relation: str | None = Field(default=None, max_length=20)
    desc: str | None = Field(default=None, max_length=2000)
    # 场景整理阶段已抽到的对方行为倾向，作为兜底/参考
    extra_traits: list[str] | None = None


@router.post("/parse-role")
def parse_role(
    body: RoleParseIn,
    user: User = Depends(get_current_user),
):
    """把用户对场景中另一个人的口述，整理成「在这场对话中 TA 会怎么表现」。

    产品红线：只写可观察的行为倾向，绝不贴人格标签、不做心理诊断（AGENTS.md 伦理红线）。
    """
    return theater.parse_role(
        name=body.name, relation=body.relation,
        desc=body.desc, extra_traits=body.extra_traits,
    )


# ─── 内部 ────────────────────────────────────────────────────────────────────

# ─── 细节补充 ─────────────────────────────────────────────────────────────────

class ScenePatch(BaseModel):
    title: str | None = None
    setting: str | None = None


@router.patch("/{scene_id}")
def patch_scene(
    scene_id: int,
    body: ScenePatch,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """补充场景细节（标题/设定）；仅传入的字段被更新。非本人或不存在时 404。"""
    s = _get_owned(db, user.id, scene_id)
    if body.title is not None:
        s.title = body.title
    if body.setting is not None:
        s.setting = body.setting
    db.commit()
    db.refresh(s)
    return {"id": s.id, "title": s.title, "setting": s.setting, "status": s.status}


# ─── 角色校准 ─────────────────────────────────────────────────────────────────

class CalibrateIn(BaseModel):
    role_name: str          # 被校准的角色（称呼，如"妈妈"）
    adjustment: str         # 用户补充的一句（"她其实更固执一点"）


@router.post("/{scene_id}/calibrate")
def calibrate(
    scene_id: int,
    body: CalibrateIn,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """「TA 不太像」校准：用户补一句 → 写入场景设定（影响后续剧情）+ upsert 角色档案。已结算场景 409。"""
    s = _get_owned(db, user.id, scene_id)
    if s.status == "settled":
        raise HTTPException(status.HTTP_409_CONFLICT, "场景已结算")
    adjustment = body.adjustment.strip()
    if not adjustment:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, "校准内容不能为空")

    # 1) 校准写入场景设定：后续 choices/advance 生成即以校准后设定为准
    s.setting = (s.setting + f"\n【用户校准】{adjustment}").strip()
    db.commit()

    # 2) 回写角色档案（按 user+name upsert）：notes 追加带日期校准，traits 去重补充
    role = db.scalar(select(RoleProfile).where(
        RoleProfile.user_id == user.id, RoleProfile.name == body.role_name
    ))
    stamp = datetime.now(timezone.utc).date().isoformat()
    if role is None:
        role = RoleProfile(user_id=user.id, name=body.role_name, relation="",
                           notes=f"[{stamp} 校准] {adjustment}", traits=[adjustment])
        db.add(role)
    else:
        role.notes = (role.notes + f"\n[{stamp} 校准] {adjustment}").strip()
        traits = list(role.traits or [])
        if adjustment not in traits:
            traits.append(adjustment)
        role.traits = traits
    db.commit()
    db.refresh(role)

    return {
        "scene_id": s.id,
        "setting": s.setting,
        "role": {"id": role.id, "name": role.name, "traits": role.traits, "notes": role.notes},
    }
