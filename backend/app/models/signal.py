"""主动触发信号相关模型。

五张表构成「信号 → 决策 → 投递」的完整链路：

- SignalEvent        每一次生成的行为信号（审计 / 去重 / 冷却判断的唯一依据）
- MotionSample       客户端上报的速度样本（只存速度，不存原始 GPS 坐标）
- DeviceUsageSignal  客户端上报的手机使用日摘要（屏幕时间 / 拿起次数 / 夜间时长）
- DecisionLog        AI 决策网关的每次判定（allow / suppress + 理由 + 完整上下文）
- DeliveryEvent      待投递 / 已投递的主动消息（客户端轮询消费）

隐私口径：速度在客户端算好再上报，后端不接收轨迹；
位置只保留最近一次模糊城市（存在 UserPreference 上）。
"""
from datetime import datetime, timezone

from sqlalchemy import (
    JSON,
    Boolean,
    DateTime,
    Float,
    Integer,
    String,
    Text,
    UniqueConstraint,
)
from sqlalchemy.orm import Mapped, mapped_column

from app.db import Base


def _utcnow() -> datetime:
    return datetime.now(timezone.utc)


class SignalEvent(Base):
    """一次行为信号。status: pending → processed / expired。"""

    __tablename__ = "signal_events"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    user_id: Mapped[int] = mapped_column(Integer, nullable=False, index=True)

    # scheduled | holiday | driving | weather | location_change | usage_anomaly
    signal_type: Mapped[str] = mapped_column(String(40), nullable=False, index=True)
    # 检测器给出的基础分 0~1
    score: Mapped[float] = mapped_column(Float, nullable=False, default=0.0)
    # 多信号并发时的排序依据
    priority: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    # 证据数据（供 AI 决策参考 + 事后审计）
    evidence: Mapped[dict | None] = mapped_column(JSON, nullable=True)
    # 同类信号冷却分钟数（写在行上，便于回溯当时的策略）
    cooldown_minutes: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    # 去重键（同一天同一场景只生成一次，例如 "3:2026-07-25:morning_checkin"）
    dedupe_key: Mapped[str | None] = mapped_column(String(120), nullable=True, index=True)

    status: Mapped[str] = mapped_column(String(16), nullable=False, default="pending", index=True)

    occurred_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, default=_utcnow, index=True
    )
    processed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, default=_utcnow
    )

    def __repr__(self) -> str:
        return (
            f"<SignalEvent {self.signal_type} user={self.user_id} "
            f"score={self.score:.2f} {self.status}>"
        )


class MotionSample(Base):
    """客户端上报的一条速度样本。client_event_id 用于幂等去重。"""

    __tablename__ = "motion_samples"
    __table_args__ = (
        UniqueConstraint("user_id", "client_event_id", name="uq_motion_user_client_event"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    user_id: Mapped[int] = mapped_column(Integer, nullable=False, index=True)
    client_event_id: Mapped[str | None] = mapped_column(String(64), nullable=True)

    occurred_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, default=_utcnow, index=True
    )
    current_speed_kmh: Mapped[float] = mapped_column(Float, nullable=False, default=0.0)
    average_speed_kmh: Mapped[float | None] = mapped_column(Float, nullable=True)
    max_speed_kmh: Mapped[float | None] = mapped_column(Float, nullable=True)
    # still | walking | running | cycling | driving | unknown
    activity_type: Mapped[str | None] = mapped_column(String(20), nullable=True)
    confidence: Mapped[float | None] = mapped_column(Float, nullable=True)
    is_driving: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, default=_utcnow
    )

    def __repr__(self) -> str:
        return f"<MotionSample user={self.user_id} {self.current_speed_kmh}km/h>"


class DeviceUsageSignal(Base):
    """手机使用日摘要（客户端 UsageStats / Screen Time 采集后上报）。

    value 结构：{total_screen_time_minutes, pickup_count, night_usage_minutes,
                 top_apps: [{app_name, usage_minutes}]}
    """

    __tablename__ = "device_usage_signals"
    __table_args__ = (
        UniqueConstraint("user_id", "stat_date", name="uq_usage_user_date"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    user_id: Mapped[int] = mapped_column(Integer, nullable=False, index=True)
    # 摘要归属的本地日期 YYYY-MM-DD，同一天重复上报直接覆盖
    stat_date: Mapped[str] = mapped_column(String(10), nullable=False, index=True)
    value: Mapped[dict | None] = mapped_column(JSON, nullable=True)

    occurred_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, default=_utcnow, index=True
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, default=_utcnow
    )

    def __repr__(self) -> str:
        return f"<DeviceUsageSignal user={self.user_id} date={self.stat_date}>"


class DecisionLog(Base):
    """AI 决策网关的一次判定记录。"""

    __tablename__ = "decision_logs"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    user_id: Mapped[int] = mapped_column(Integer, nullable=False, index=True)

    scenario: Mapped[str] = mapped_column(String(60), nullable=False)
    decision: Mapped[str] = mapped_column(String(16), nullable=False)  # allow | suppress
    reason: Mapped[str] = mapped_column(Text, nullable=False, default="")
    context: Mapped[dict | None] = mapped_column(JSON, nullable=True)

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, default=_utcnow, index=True
    )

    def __repr__(self) -> str:
        return f"<DecisionLog {self.scenario} {self.decision} user={self.user_id}>"


class DeliveryEvent(Base):
    """一条待投递 / 已投递的主动消息。

    channel: bubble（桌宠气泡）| letter（信箱来信）| voice（气泡 + 语音播报）
    status:  pending → delivered
    """

    __tablename__ = "delivery_events"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    user_id: Mapped[int] = mapped_column(Integer, nullable=False, index=True)
    decision_log_id: Mapped[int | None] = mapped_column(Integer, nullable=True)
    signal_event_id: Mapped[int | None] = mapped_column(Integer, nullable=True)
    letter_id: Mapped[int | None] = mapped_column(Integer, nullable=True)

    channel: Mapped[str] = mapped_column(String(20), nullable=False, default="bubble")
    status: Mapped[str] = mapped_column(String(16), nullable=False, default="pending", index=True)

    title: Mapped[str] = mapped_column(String(120), nullable=False, default="")
    body: Mapped[str] = mapped_column(Text, nullable=False, default="")
    payload: Mapped[dict | None] = mapped_column(JSON, nullable=True)

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, default=_utcnow, index=True
    )
    delivered_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    def __repr__(self) -> str:
        return f"<DeliveryEvent {self.channel} {self.status} user={self.user_id}>"
