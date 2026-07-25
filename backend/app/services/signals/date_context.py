"""日期 / 法定节假日上下文。

内置国务院办公厅公告的放假安排表（含调休上班日），不引入第三方日历包。表里没有的年份优雅降级为
「固定公历节日 + 工作日/周末」判断，绝不让整条主动触达链路挂掉。

数据来源：国务院办公厅《关于2026年部分节假日安排的通知》
（国办发明电〔2025〕7号，2025-11-04）。
新年份只需往 HOLIDAY_RANGES / MAKEUP_WORKDAYS 追加一行。
"""
from __future__ import annotations

import logging
from dataclasses import asdict, dataclass
from datetime import date, datetime, timedelta
from typing import Any

logger = logging.getLogger(__name__)

WEEKDAY_NAMES = ["周一", "周二", "周三", "周四", "周五", "周六", "周日"]

# {年份: [(节日名, 起始日, 结束日), ...]}，闭区间
HOLIDAY_RANGES: dict[int, list[tuple[str, str, str]]] = {
    2026: [
        ("元旦", "2026-01-01", "2026-01-03"),
        ("春节", "2026-02-15", "2026-02-23"),
        ("清明节", "2026-04-04", "2026-04-06"),
        ("劳动节", "2026-05-01", "2026-05-05"),
        ("端午节", "2026-06-19", "2026-06-21"),
        ("中秋节", "2026-09-25", "2026-09-27"),
        ("国庆节", "2026-10-01", "2026-10-07"),
    ],
}

# {年份: {调休上班日}}——周末但要上班
MAKEUP_WORKDAYS: dict[int, set[str]] = {
    2026: {
        "2026-01-04",  # 元旦调休
        "2026-02-14", "2026-02-28",  # 春节调休
        "2026-05-09",  # 劳动节调休
        "2026-09-20", "2026-10-10",  # 国庆调休
    },
}

# 表里没有该年份时仍能识别的固定公历节日（农历节日无法推算，只能降级）
FIXED_SOLAR_HOLIDAYS: dict[tuple[int, int], str] = {
    (1, 1): "元旦",
    (5, 1): "劳动节",
    (10, 1): "国庆节",
}


@dataclass(frozen=True)
class DateContext:
    """某一天的中文日期上下文。"""

    date: str  # YYYY-MM-DD
    weekday: int  # 0=周一 … 6=周日
    weekday_name: str
    date_type: str  # workday | weekend | holiday
    holiday_name: str | None
    is_public_holiday: bool
    is_workday: bool
    is_weekend: bool
    is_holiday_first_day: bool  # 节假日第一天（最适合发祝福）
    is_holiday_eve: bool  # 节假日前最后一个工作日（"明天开始放假了"）
    days_to_next_holiday: int | None
    next_holiday_name: str | None

    def to_dict(self) -> dict[str, Any]:
        return asdict(self)


def _parse(value: str) -> date:
    return date.fromisoformat(value)


def _holiday_for(d: date) -> tuple[str, date, date] | None:
    for name, start, end in HOLIDAY_RANGES.get(d.year, []):
        s, e = _parse(start), _parse(end)
        if s <= d <= e:
            return name, s, e
    # 跨年假期（例如元旦横跨 12/31）：也查一下下一年的表
    for name, start, end in HOLIDAY_RANGES.get(d.year + 1, []):
        s, e = _parse(start), _parse(end)
        if s <= d <= e:
            return name, s, e
    if d.year not in HOLIDAY_RANGES:
        name = FIXED_SOLAR_HOLIDAYS.get((d.month, d.day))
        if name:
            return name, d, d
    return None


def _next_holiday(d: date) -> tuple[str, date] | None:
    """最近一个未开始的法定节假日（只看已录入的年份）。"""
    upcoming: list[tuple[date, str]] = []
    for year in (d.year, d.year + 1):
        for name, start, _end in HOLIDAY_RANGES.get(year, []):
            s = _parse(start)
            if s > d:
                upcoming.append((s, name))
    if not upcoming:
        return None
    upcoming.sort()
    start, name = upcoming[0]
    return name, start


def get_date_context(local_dt: datetime) -> DateContext:
    """根据本地时间返回日期上下文。任何异常都降级为工作日/周末判断。"""
    d = local_dt.date()
    weekday = d.weekday()
    is_weekend = weekday >= 5

    try:
        hit = _holiday_for(d)
        makeup = MAKEUP_WORKDAYS.get(d.year, set())
        is_makeup_workday = d.isoformat() in makeup

        if hit:
            name, start, _end = hit
            is_public_holiday = True
            date_type = "holiday"
            is_first_day = d == start
        else:
            name = None
            is_public_holiday = False
            is_first_day = False
            date_type = "workday" if (not is_weekend or is_makeup_workday) else "weekend"

        is_workday = not is_public_holiday and (not is_weekend or is_makeup_workday)

        # 节前最后一个工作日
        tomorrow_hit = _holiday_for(d + timedelta(days=1))
        is_holiday_eve = bool(tomorrow_hit) and not is_public_holiday

        nxt = _next_holiday(d)
        days_to_next = (nxt[1] - d).days if nxt else None
        next_name = nxt[0] if nxt else None

        if d.year not in HOLIDAY_RANGES:
            logger.info(
                "[date_context] %d 年放假安排未录入，农历节日降级为工作日/周末判断", d.year
            )

        return DateContext(
            date=d.isoformat(),
            weekday=weekday,
            weekday_name=WEEKDAY_NAMES[weekday],
            date_type=date_type,
            holiday_name=name,
            is_public_holiday=is_public_holiday,
            is_workday=is_workday,
            is_weekend=is_weekend,
            is_holiday_first_day=is_first_day,
            is_holiday_eve=is_holiday_eve,
            days_to_next_holiday=days_to_next,
            next_holiday_name=next_name,
        )
    except Exception as e:  # noqa: BLE001
        logger.warning("[date_context] 解析失败 date=%s err=%s，降级为周末判断", d, e)
        return DateContext(
            date=d.isoformat(),
            weekday=weekday,
            weekday_name=WEEKDAY_NAMES[weekday],
            date_type="weekend" if is_weekend else "workday",
            holiday_name=None,
            is_public_holiday=False,
            is_workday=not is_weekend,
            is_weekend=is_weekend,
            is_holiday_first_day=False,
            is_holiday_eve=False,
            days_to_next_holiday=None,
            next_holiday_name=None,
        )
