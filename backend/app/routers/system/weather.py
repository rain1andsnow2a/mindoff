"""天气：GET /api/v1/weather/current?lat=&lon=（登录用户；服务端调彩云，key 不下发前端）。"""
from fastapi import APIRouter, Depends, HTTPException, Query, status

from app.deps import get_current_user
from app.models.user import User
from app.services.weather import weather_service

router = APIRouter(prefix="/api/v1/weather", tags=["weather"])


@router.get("/current")
def current_weather(
    lat: float = Query(..., ge=-90, le=90),
    lon: float = Query(..., ge=-180, le=180),
    user: User = Depends(get_current_user),
):
    """按经纬度返回当前天气（condition/temperature/humidity/…）。未配置 key 或请求失败 → 503。"""
    try:
        return weather_service.get_current_weather(lat, lon)
    except RuntimeError as e:
        raise HTTPException(status.HTTP_503_SERVICE_UNAVAILABLE, str(e))
