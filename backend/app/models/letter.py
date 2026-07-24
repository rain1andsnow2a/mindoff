"""桌宠来信：服务端主动陪伴的落库产物（api-design §8.1）。

生成是服务端主动行为（proactive / 定时触发），不开放公开写接口；
用户侧只做查看、已读、删除。type ∈ music/movie/book/greeting/relationship/scene_invite。
"""
from datetime import datetime, timezone

from sqlalchemy import JSON, Boolean, DateTime, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from app.db import Base


def _utcnow() -> datetime:
    return datetime.now(timezone.utc)


class Letter(Base):
    __tablename__ = "letters"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    user_id: Mapped[int] = mapped_column(Integer, nullable=False, index=True)

    type: Mapped[str] = mapped_column(String(30), nullable=False, default="greeting")
    title: Mapped[str] = mapped_column(String(200), nullable=False)
    body: Mapped[str] = mapped_column(Text, nullable=False)

    # 关联引用（裸 Integer + 不设 FK，与 handoff/pet 一致的先例）
    pet_id: Mapped[int | None] = mapped_column(Integer, nullable=True)
    ref_memory_id: Mapped[int | None] = mapped_column(Integer, nullable=True)

    # 附件卡（"信里夹了一首歌"：{label, title, artist, reason, ...}，可空）
    attachment: Mapped[dict | None] = mapped_column(JSON, nullable=True)

    is_read: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, default=_utcnow
    )

    def __repr__(self) -> str:
        return f"<Letter id={self.id} user={self.user_id} type={self.type} read={self.is_read}>"
