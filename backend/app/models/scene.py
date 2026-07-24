"""片场场景模型：一次视觉小说式重演。

MVP：Scene 自带当前剧情状态（beats + choices + history + turn），单场景单次体验，
不做独立 playId/并发多次。渲染（立绘/背景图）由前端负责，本模型只存文本与状态。
"""
from datetime import datetime, timezone

from sqlalchemy import DateTime, Integer, JSON, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from app.db import Base


def _utcnow() -> datetime:
    return datetime.now(timezone.utc)


class Scene(Base):
    __tablename__ = "scenes"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    user_id: Mapped[int] = mapped_column(Integer, nullable=False, index=True)
    title: Mapped[str] = mapped_column(String(200), nullable=False, default="")
    status: Mapped[str] = mapped_column(String(20), nullable=False, default="active")  # active|settled
    source_fragment_id: Mapped[int | None] = mapped_column(Integer, nullable=True)

    setting: Mapped[str] = mapped_column(Text, nullable=False, default="")
    beats: Mapped[list | None] = mapped_column(JSON, nullable=True)     # [{speaker, text}]
    choices: Mapped[list | None] = mapped_column(JSON, nullable=True)   # [{id, label}]
    history: Mapped[list | None] = mapped_column(JSON, nullable=True)   # [{turn, choice}]
    turn: Mapped[int] = mapped_column(Integer, nullable=False, default=0)

    # 渲染方式：preset_3d 走前端预置 Three.js 舞台；dynamic_image 走动态 galgame（背景图+立绘）
    render_kind: Mapped[str] = mapped_column(String(20), nullable=False, default="preset_3d")
    theater_id: Mapped[str | None] = mapped_column(String(40), nullable=True)  # 预置舞台 id（后端正式持有）
    bg_image: Mapped[str | None] = mapped_column(String(255), nullable=True)   # /static 相对 URL
    characters: Mapped[list | None] = mapped_column(JSON, nullable=True)       # [{name, sprite_url}]

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, default=_utcnow
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, default=_utcnow, onupdate=_utcnow
    )

    def __repr__(self) -> str:
        return f"<Scene id={self.id} user={self.user_id} status={self.status!r}>"
