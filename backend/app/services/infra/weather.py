"""彩云天气服务（Caiyun v2.6）。

按经纬度查实时天气，服务端内存缓存 + 字段归一化。改为同步实现，
方便在同步的对话链路（app/graphs/companion + routers/conversations）里组装环境上下文。
key 只在服务端使用（config.caiyun_app_key/secret），绝不下发前端。
"""
from __future__ import annotations

import base64
import hashlib
import hmac
import logging
import time
import uuid
from datetime import datetime, timedelta, timezone
from typing import Any, Optional

import httpx

from app.config import get_settings

logger = logging.getLogger(__name__)


class WeatherCache:
    """极简内存缓存，按坐标 key 缓存天气结果。"""

    def __init__(self, ttl_seconds: int = 1800):
        self.ttl_seconds = ttl_seconds
        self._store: dict[str, dict[str, Any]] = {}

    def _key(self, lat: float, lon: float) -> str:
        # 坐标保留 2 位小数，约 1km 精度，避免同一城市内频繁刷新
        return f"{round(lat, 2)},{round(lon, 2)}"

    def get(self, lat: float, lon: float) -> Optional[dict]:
        entry = self._store.get(self._key(lat, lon))
        if not entry:
            return None
        if time.time() - entry["ts"] > self.ttl_seconds:
            self._store.pop(self._key(lat, lon), None)
            return None
        return entry["data"]

    def set(self, lat: float, lon: float, data: dict) -> None:
        self._store[self._key(lat, lon)] = {"ts": time.time(), "data": data}

    def clear(self) -> None:
        self._store.clear()


# 彩云天气现象代码 -> 中文天气描述
SKYCON_TO_TEXT: dict[str, str] = {
    "CLEAR_DAY": "晴", "CLEAR_NIGHT": "晴",
    "PARTLY_CLOUDY_DAY": "多云", "PARTLY_CLOUDY_NIGHT": "多云",
    "CLOUDY": "阴",
    "LIGHT_HAZE": "轻度霾", "MODERATE_HAZE": "中度霾", "HEAVY_HAZE": "重度霾",
    "LIGHT_RAIN": "小雨", "MODERATE_RAIN": "中雨", "HEAVY_RAIN": "大雨", "STORM_RAIN": "暴雨",
    "FOG": "雾",
    "LIGHT_SNOW": "小雪", "MODERATE_SNOW": "中雪", "HEAVY_SNOW": "大雪", "STORM_SNOW": "暴雪",
    "DUST": "浮尘", "SAND": "扬沙", "WIND": "大风",
    "THUNDER_SHOWER": "雷阵雨", "HAIL": "冰雹",
}


class CaiyunWeatherService:
    """彩云天气 v2.6（App Key + App Secret HMAC 签名）。同步实现。"""

    def __init__(self):
        s = get_settings()
        self.cache = WeatherCache(ttl_seconds=max(60, s.caiyun_cache_minutes * 60))
        self.base_url = "https://api.caiyunapp.com"

    def get_current_weather(self, lat: float, lon: float) -> dict:
        """获取指定坐标的当前天气，归一化为 condition/temperature/humidity/... 字典。"""
        s = get_settings()
        if not s.caiyun_app_key or not s.caiyun_app_secret:
            logger.warning("[weather] caiyun app_key/app_secret 未配置")
            raise RuntimeError("天气服务未配置：缺少 CAIYUN_APP_KEY 或 CAIYUN_APP_SECRET")

        cached = self.cache.get(lat, lon)
        if cached:
            return cached

        path = f"/v2.6/{s.caiyun_app_key}/{lon:.4f},{lat:.4f}/realtime"
        url = f"{self.base_url}{path}"
        headers = self._auth_headers(path, s.caiyun_app_key, s.caiyun_app_secret)

        try:
            with httpx.Client(timeout=10.0) as client:
                response = client.get(url, headers=headers)
            payload = response.json() if response.content else {}
        except httpx.HTTPError as exc:
            logger.error("[weather] caiyun 请求失败: %s", exc)
            raise RuntimeError("天气服务请求失败：无法连接彩云天气") from exc

        status = payload.get("status")
        if response.status_code != 200 or status != "ok":
            logger.error("[weather] caiyun 返回错误 status=%s http=%s", status, response.status_code)
            raise RuntimeError(f"天气服务返回错误: status={status}, http={response.status_code}")

        realtime = payload.get("result", {}).get("realtime", {})
        skycon = realtime.get("skycon", "")
        result = {
            "condition": SKYCON_TO_TEXT.get(skycon, skycon),
            "condition_code": skycon,
            "temperature": self._to_int(realtime.get("temperature")),
            "feels_like": self._to_int(realtime.get("apparent_temperature")),
            "humidity": self._to_int(self._humidity_percent(realtime.get("humidity"))),
            "wind_scale": self._to_wind_scale(realtime.get("wind", {}).get("speed")),
            "pressure": self._to_int(self._pa_to_hpa(realtime.get("pressure"))),
            "visibility": self._to_float(realtime.get("visibility")),
            "updated_at": self._format_time(payload.get("server_time")),
        }
        self.cache.set(lat, lon, result)
        return result

    def _auth_headers(self, path: str, app_key: str, app_secret: str, query: str = "") -> dict:
        """彩云 v2.6 HMAC-SHA256 认证头。"""
        nonce = str(uuid.uuid4())
        timestamp = str(int(time.time()))
        string_to_sign = f"GET:{path}:{query}:{app_key}:{nonce}:{timestamp}"
        signature = base64.urlsafe_b64encode(
            hmac.new(app_secret.encode("utf-8"), string_to_sign.encode("utf-8"), hashlib.sha256).digest()
        ).decode("utf-8")
        return {
            "Accept": "application/json",
            "x-cy-nonce": nonce,
            "x-cy-timestamp": timestamp,
            "x-cy-signature": signature,
        }

    @staticmethod
    def _format_time(ts: Any) -> str:
        if ts is None:
            return ""
        try:
            dt = datetime.fromtimestamp(int(ts), tz=timezone(timedelta(hours=8)))
            return dt.isoformat()
        except (ValueError, TypeError, OSError):
            return str(ts)

    @staticmethod
    def _pa_to_hpa(pa: Any) -> Optional[float]:
        try:
            return float(pa) / 100.0 if pa is not None else None
        except (ValueError, TypeError):
            return None

    @staticmethod
    def _humidity_percent(humidity: Any) -> Optional[float]:
        try:
            return float(humidity) * 100.0 if humidity is not None else None
        except (ValueError, TypeError):
            return None

    @staticmethod
    def _to_wind_scale(speed: Any) -> str:
        if speed is None:
            return ""
        try:
            s = float(speed)
        except (ValueError, TypeError):
            return str(speed)
        if s < 1: return "0级"
        if s < 5.5: return "1-3级"
        if s < 10.8: return "4-5级"
        if s < 17.2: return "6-7级"
        if s < 24.5: return "8级"
        return "≥9级"

    @staticmethod
    def _to_int(value: Any) -> Optional[int]:
        try:
            return int(value) if value is not None else None
        except (ValueError, TypeError):
            return None

    @staticmethod
    def _to_float(value: Any) -> Optional[float]:
        try:
            return float(value) if value is not None else None
        except (ValueError, TypeError):
            return None


weather_service = CaiyunWeatherService()
