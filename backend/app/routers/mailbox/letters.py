"""桌宠来信 REST 接口（api-design §8.1）。

GET    /api/v1/letters            列表（?type=&unread=）
GET    /api/v1/letters/{id}       详情
PATCH  /api/v1/letters/{id}       标记已读 {read:true}
DELETE /api/v1/letters/{id}       删除
POST   /api/v1/letters/{id}/ack   「收到啦」：标记已读 + 桌宠 agent 回一句轻回应
POST   /api/v1/letters/{id}/reply 「回它一句」：以来信为上下文开一段对话 + 桌宠续写

生成是服务端主动行为（proactive / 定时），不开放公开写接口。
"""
from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.db import get_db
from app.deps import get_current_user
from app.models.user import User
from app.services.mailbox.letter_store import LETTER_TYPES, LetterStore
from app.services.pet.pet_store import PetStore

router = APIRouter(prefix="/api/v1/letters", tags=["letters"])


class LetterOut(BaseModel):
    id: int
    type: str
    title: str
    body: str
    pet_id: int | None
    ref_memory_id: int | None
    attachment: dict | None
    is_read: bool
    created_at: datetime

    model_config = {"from_attributes": True}


class LetterPatch(BaseModel):
    read: bool | None = None


def _require_letter(db: Session, user: User, letter_id: int):
    letter = LetterStore(db).get(user.id, letter_id)
    if letter is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "来信不存在")
    return letter


# 动态 galgame 配图生成已抽离到公共服务，letters/scenes 共用（DAY-215）。
from app.services.scene.scene_images import gen_scene_images as _gen_scene_images


@router.get("", response_model=list[LetterOut])
def list_letters(
    type: str | None = Query(None, description="music|movie|book|greeting|relationship|scene_invite|weekly|reminder"),
    unread: bool = Query(False),
    limit: int = Query(50, ge=1, le=100),
    cursor: int | None = Query(None, description="上一页最小 id，用于向更早翻页"),
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    if type is not None and type not in LETTER_TYPES:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, f"未知来信类型: {type}")
    return LetterStore(db).list_for_user(user.id, type=type, unread=unread,
                                         limit=limit, cursor=cursor)


@router.get("/{letter_id}", response_model=LetterOut)
def get_letter(
    letter_id: int,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    return _require_letter(db, user, letter_id)


@router.patch("/{letter_id}", response_model=LetterOut)
def patch_letter(
    letter_id: int,
    body: LetterPatch,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    letter = _require_letter(db, user, letter_id)
    if body.read is not None:
        letter = LetterStore(db).mark_read(letter, body.read)
    return letter


@router.delete("/{letter_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_letter(
    letter_id: int,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    letter = _require_letter(db, user, letter_id)
    LetterStore(db).delete(letter)
    return None


@router.post("/{letter_id}/ack")
def ack_letter(
    letter_id: int,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """用户点击「收到啦」后：标记已读 + 由**当前激活桌宠**回一句轻回应。

    回应经 run_companion（BASE_PERSONA + 桌宠 system_prompt 人格层）生成，
    与聊天同一套人格，不是通用文案。与 /reply 的区别：ack 不开会话、不留对话记录。
    """
    from app.services.mailbox.letter_ack import generate_ack_response

    letter = _require_letter(db, user, letter_id)
    LetterStore(db).mark_read(letter, True)

    pet = PetStore(db).get_active(user.id)
    text = generate_ack_response(
        letter.body, pet_prompt=pet.system_prompt if pet is not None else None
    )
    return {
        "message": text,
        "letter_id": letter.id,
        "is_read": True,
        "pet_name": getattr(pet, "name", None),
    }


class ReplyIn(BaseModel):
    text: str


@router.post("/{letter_id}/reply", status_code=status.HTTP_201_CREATED)
def reply_letter(
    letter_id: int,
    body: ReplyIn,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """对一封来信回信：以信件内容为上下文开一段对话，持久化用户回信，
    并生成桌宠的第一句续写（非流式；前端之后可继续 streamChatReply）。"""
    from app.graphs.companion import run_companion
    from app.services.companion.conversation_store import ConversationStore

    letter = _require_letter(db, user, letter_id)
    text = body.text.strip()
    if not text:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, "回信内容不能为空")

    store = ConversationStore(db)
    conv = store.create(user_id=user.id, mode="free_chat", pet_id=letter.pet_id,
                        title=f"回信：{letter.title[:20]}")
    # 上下文种子：信本身（assistant）→ 用户回信（user）
    store.add_message(conv.id, role="assistant",
                      content=f"（我写给你的信）{letter.title}\n{letter.body}")
    store.add_message(conv.id, role="user", content=text)

    # 取来信关联桌宠或当前主桌宠的人设
    from app.services.pet.pet_store import PetStore
    pet = None
    if letter.pet_id is not None:
        pet = PetStore(db).get(user.id, letter.pet_id)
    if pet is None:
        pet = PetStore(db).get_active(user.id)
    pet_prompt = pet.system_prompt if pet else None

    history = store.history_as_dicts(conv.id)
    reply_text = run_companion("free_chat", history, None, pet_prompt=pet_prompt)
    reply = store.add_message(conv.id, role="assistant", content=reply_text)

    # 回信后顺手标记已读
    LetterStore(db).mark_read(letter, True)

    return {
        "conversation_id": conv.id,
        "reply": {"id": reply.id, "role": reply.role, "content": reply.content},
    }


@router.post("/{letter_id}/accept-scene")
def accept_scene_invite(
    letter_id: int,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """接受场景邀请信：按信中场景种子生成 Scene，返回进场信息。

    - 仅 type=scene_invite 可接受；
    - 幂等：已接受过（attachment 里有 scene_id）直接返回同一场景；
    - 生成成功后把 scene_id 回写进 attachment，并标记已读。
    """
    from app.graphs import theater
    from app.models.scene import Scene

    letter = _require_letter(db, user, letter_id)
    if letter.type != "scene_invite":
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, "这封信不是场景邀请")

    att = dict(letter.attachment or {})
    seed = dict(att.get("seed") or {})
    render_kind = att.get("render_kind") or "dynamic_image"
    theater_id = att.get("theater_id")

    # 幂等：已接受过 → 返回已有场景
    existing_id = att.get("scene_id")
    if existing_id is not None:
        existing = db.get(Scene, existing_id)
        if existing is not None and existing.user_id == user.id:
            return {
                "scene_id": existing.id,
                "render_kind": existing.render_kind or render_kind,
                "theater_id": existing.theater_id or theater_id,
                "bg_image": existing.bg_image,
                "characters": existing.characters,
                "already_accepted": True,
            }

    people = seed.get("people")
    people_text = "、".join(people) if isinstance(people, list) else (people or None)
    opening = theater.generate_manual(
        title=seed.get("title") or letter.title,
        people=people_text,
        place=seed.get("place") or None,
        plot=seed.get("plot") or None,
        intent=seed.get("intent") or None,
    )

    # 渲染分流：generated_3d 产 SceneSpec（失败降级 galgame）；dynamic_image 生成背景+立绘
    bg_image: str | None = None
    characters: list | None = None
    scene_spec: dict | None = None
    if render_kind == "generated_3d":
        from app.services.scene.scene_spec import generate_scene_spec
        scene_spec = generate_scene_spec(seed)
        if scene_spec is None:
            render_kind = "dynamic_image"  # 降级：spec 生成失败
    if render_kind == "dynamic_image":
        bg_image, characters = _gen_scene_images(
            title=seed.get("title") or letter.title,
            people=people_text,
            place=seed.get("place") or None,
            plot=seed.get("plot") or None,
            intent=seed.get("intent") or None,
            setting=opening.get("setting"),
        )

    scene = Scene(
        user_id=user.id,
        title=opening["title"],
        status="active",
        source_fragment_id=None,
        setting=opening["setting"],
        beats=opening["beats"],
        choices=opening["choices"],
        history=[],
        turn=0,
        render_kind=render_kind if render_kind in ("preset_3d", "dynamic_image", "generated_3d") else "dynamic_image",
        theater_id=theater_id,
        bg_image=bg_image,
        characters=characters,
        scene_spec=scene_spec,
    )
    db.add(scene)
    db.commit()
    db.refresh(scene)

    # 回写 scene_id（JSON 列需整体重新赋值才会脏检查）+ 标记已读
    att["scene_id"] = scene.id
    letter.attachment = att
    letter.is_read = True
    db.commit()

    return {
        "scene_id": scene.id,
        "render_kind": scene.render_kind,
        "theater_id": scene.theater_id,
        "bg_image": scene.bg_image,
        "characters": scene.characters,
        "already_accepted": False,
    }
