"""片场场景业务逻辑：剧情推进与结算回写。

路由（scenes.py / candidates.py）只做参数校验与响应组装，推进/结算规则集中在此，
避免 `/scenes/{id}/choices` 与 `/plays/{id}/choices`、两个 settlement 端点各写一份。
"""
from __future__ import annotations

from typing import Any

from sqlalchemy.orm import Session

from app.graphs import theater
from app.models.scene import Scene
from app.services import stage
from app.services.scene_turn_images import schedule_bg_regen


def advance(db: Session, scene: Scene, label: str) -> dict[str, Any]:
    """按用户回应 label 推进一幕并落库。返回 theater.advance 的原始结果。

    beats 追加而非替换（保住完整对白史供结算取材）；dynamic_image 场景推进后
    异步刷新背景图（未结束时）。调用方需先校验 scene 归属与未结算状态。
    """
    res = theater.advance(
        {"setting": scene.setting, "beats": scene.beats,
         "history": scene.history, "turn": scene.turn},
        label,
    )
    scene.turn = scene.turn + 1
    scene.beats = (scene.beats or []) + res["beats"]
    scene.choices = res["choices"]
    scene.history = (scene.history or []) + [{"turn": scene.turn, "choice": label}]
    db.commit()
    db.refresh(scene)
    if not res.get("ended") and scene.render_kind == "dynamic_image":
        schedule_bg_regen(scene.id)
    return res


def settle(
    db: Session,
    scene: Scene,
    user_id: int,
    *,
    action_text: str | None = None,
    insight_text: str | None = None,
    related_memory_ids: list[int] | None = None,
    role_id: int | None = None,
    keep: bool = True,
    card_text: str | None = None,
) -> dict[str, Any]:
    """结算场景：复用 stage.settle 回写产出，并把场景标记为 settled。返回结算结果。"""
    result = stage.settle(
        db, user_id,
        action_text=action_text,
        insight_text=insight_text,
        related_memory_ids=related_memory_ids,
        role_id=role_id,
        keep=keep,
        card_text=card_text,
        scene_id=scene.id,
    )
    scene.status = "settled"
    scene.choices = []
    db.commit()
    return result
