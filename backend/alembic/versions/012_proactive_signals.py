"""proactive signal engine: signal/motion/usage/decision/delivery tables + preference triggers

Revision ID: 012_proactive_signals
Revises: 011_pet_system_prompt
Create Date: 2026-07-25

同时补齐 user_preferences 的位置列（dev 期由 main._ensure_preference_location_columns
用 ADD COLUMN 加过，但一直缺 alembic 迁移，这里一并纳入以对齐生产）。
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "012_proactive_signals"
down_revision: Union[str, None] = "011_pet_system_prompt"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def _has_column(table: str, column: str) -> bool:
    bind = op.get_bind()
    insp = sa.inspect(bind)
    return column in {c["name"] for c in insp.get_columns(table)}


def upgrade() -> None:
    # ─── 信号事件 ────────────────────────────────────────────────────────────
    op.create_table(
        "signal_events",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column("user_id", sa.Integer(), nullable=False),
        sa.Column("signal_type", sa.String(40), nullable=False),
        sa.Column("score", sa.Float(), nullable=False, server_default="0"),
        sa.Column("priority", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("evidence", sa.JSON(), nullable=True),
        sa.Column("cooldown_minutes", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("dedupe_key", sa.String(120), nullable=True),
        sa.Column("status", sa.String(16), nullable=False, server_default="pending"),
        sa.Column("occurred_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("processed_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
    )
    op.create_index("ix_signal_events_user_id", "signal_events", ["user_id"])
    op.create_index("ix_signal_events_signal_type", "signal_events", ["signal_type"])
    op.create_index("ix_signal_events_status", "signal_events", ["status"])
    op.create_index("ix_signal_events_occurred_at", "signal_events", ["occurred_at"])
    op.create_index("ix_signal_events_dedupe_key", "signal_events", ["dedupe_key"])

    # ─── 速度样本 ────────────────────────────────────────────────────────────
    op.create_table(
        "motion_samples",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column("user_id", sa.Integer(), nullable=False),
        sa.Column("client_event_id", sa.String(64), nullable=True),
        sa.Column("occurred_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("current_speed_kmh", sa.Float(), nullable=False, server_default="0"),
        sa.Column("average_speed_kmh", sa.Float(), nullable=True),
        sa.Column("max_speed_kmh", sa.Float(), nullable=True),
        sa.Column("activity_type", sa.String(20), nullable=True),
        sa.Column("confidence", sa.Float(), nullable=True),
        sa.Column("is_driving", sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.UniqueConstraint("user_id", "client_event_id", name="uq_motion_user_client_event"),
    )
    op.create_index("ix_motion_samples_user_id", "motion_samples", ["user_id"])
    op.create_index("ix_motion_samples_occurred_at", "motion_samples", ["occurred_at"])

    # ─── 手机使用日摘要 ──────────────────────────────────────────────────────
    op.create_table(
        "device_usage_signals",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column("user_id", sa.Integer(), nullable=False),
        sa.Column("stat_date", sa.String(10), nullable=False),
        sa.Column("value", sa.JSON(), nullable=True),
        sa.Column("occurred_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.UniqueConstraint("user_id", "stat_date", name="uq_usage_user_date"),
    )
    op.create_index("ix_device_usage_signals_user_id", "device_usage_signals", ["user_id"])
    op.create_index("ix_device_usage_signals_stat_date", "device_usage_signals", ["stat_date"])
    op.create_index("ix_device_usage_signals_occurred_at", "device_usage_signals", ["occurred_at"])

    # ─── 决策日志 ────────────────────────────────────────────────────────────
    op.create_table(
        "decision_logs",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column("user_id", sa.Integer(), nullable=False),
        sa.Column("scenario", sa.String(60), nullable=False),
        sa.Column("decision", sa.String(16), nullable=False),
        sa.Column("reason", sa.Text(), nullable=False, server_default=""),
        sa.Column("context", sa.JSON(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
    )
    op.create_index("ix_decision_logs_user_id", "decision_logs", ["user_id"])
    op.create_index("ix_decision_logs_created_at", "decision_logs", ["created_at"])

    # ─── 投递事件 ────────────────────────────────────────────────────────────
    op.create_table(
        "delivery_events",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column("user_id", sa.Integer(), nullable=False),
        sa.Column("decision_log_id", sa.Integer(), nullable=True),
        sa.Column("signal_event_id", sa.Integer(), nullable=True),
        sa.Column("letter_id", sa.Integer(), nullable=True),
        sa.Column("channel", sa.String(20), nullable=False, server_default="bubble"),
        sa.Column("status", sa.String(16), nullable=False, server_default="pending"),
        sa.Column("title", sa.String(120), nullable=False, server_default=""),
        sa.Column("body", sa.Text(), nullable=False, server_default=""),
        sa.Column("payload", sa.JSON(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("delivered_at", sa.DateTime(timezone=True), nullable=True),
    )
    op.create_index("ix_delivery_events_user_id", "delivery_events", ["user_id"])
    op.create_index("ix_delivery_events_status", "delivery_events", ["status"])
    op.create_index("ix_delivery_events_created_at", "delivery_events", ["created_at"])

    # ─── user_preferences 扩展 ───────────────────────────────────────────────
    columns = [
        # 位置（dev 期已用 ADD COLUMN 补过，这里补迁移记录）
        sa.Column("last_lat", sa.Float(), nullable=True),
        sa.Column("last_lon", sa.Float(), nullable=True),
        sa.Column("last_city", sa.String(60), nullable=True),
        sa.Column("location_updated_at", sa.DateTime(timezone=True), nullable=True),
        # 主动触发偏好
        sa.Column("proactive_schedule_times", sa.JSON(), nullable=True),
        sa.Column("quiet_hours_start", sa.String(5), nullable=False, server_default="23:00"),
        sa.Column("quiet_hours_end", sa.String(5), nullable=False, server_default="07:00"),
        sa.Column("is_muted", sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column("scheduled_checkin_enabled", sa.Boolean(), nullable=False, server_default=sa.true()),
        sa.Column("holiday_greeting_enabled", sa.Boolean(), nullable=False, server_default=sa.true()),
        sa.Column("motion_detection_enabled", sa.Boolean(), nullable=False, server_default=sa.true()),
        sa.Column("driving_alert_enabled", sa.Boolean(), nullable=False, server_default=sa.true()),
        sa.Column("weather_alert_enabled", sa.Boolean(), nullable=False, server_default=sa.true()),
        sa.Column("usage_anomaly_enabled", sa.Boolean(), nullable=False, server_default=sa.true()),
        sa.Column("max_daily_triggers", sa.Integer(), nullable=False, server_default="6"),
        sa.Column("driving_mode_active", sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column("last_motion_signal_at", sa.DateTime(timezone=True), nullable=True),
    ]
    for column in columns:
        if not _has_column("user_preferences", column.name):
            op.add_column("user_preferences", column)


def downgrade() -> None:
    for name in (
        "last_motion_signal_at", "driving_mode_active", "max_daily_triggers",
        "usage_anomaly_enabled", "weather_alert_enabled", "driving_alert_enabled",
        "motion_detection_enabled", "holiday_greeting_enabled",
        "scheduled_checkin_enabled", "is_muted", "quiet_hours_end",
        "quiet_hours_start", "proactive_schedule_times",
        "location_updated_at", "last_city", "last_lon", "last_lat",
    ):
        if _has_column("user_preferences", name):
            op.drop_column("user_preferences", name)

    op.drop_table("delivery_events")
    op.drop_table("decision_logs")
    op.drop_table("device_usage_signals")
    op.drop_table("motion_samples")
    op.drop_table("signal_events")
