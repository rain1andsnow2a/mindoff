"""密码哈希（bcrypt）与 JWT 签发/校验。密钥来自 config.jwt_secret。"""
from datetime import datetime, timedelta, timezone
from typing import Any

import bcrypt
import jwt

from app.config import get_settings

_BCRYPT_MAX = 72  # bcrypt 仅使用前 72 字节；超长口令按此截断（标准行为）


def hash_password(password: str) -> str:
    pw = password.encode("utf-8")[:_BCRYPT_MAX]
    return bcrypt.hashpw(pw, bcrypt.gensalt()).decode("utf-8")


def verify_password(password: str, password_hash: str) -> bool:
    try:
        return bcrypt.checkpw(
            password.encode("utf-8")[:_BCRYPT_MAX], password_hash.encode("utf-8")
        )
    except ValueError:
        return False


def _create_token(sub: str, token_type: str, expires: timedelta) -> str:
    s = get_settings()
    now = datetime.now(timezone.utc)
    payload = {"sub": sub, "type": token_type, "iat": now, "exp": now + expires}
    return jwt.encode(payload, s.jwt_secret, algorithm=s.jwt_algorithm)


def create_access_token(user_id: int) -> str:
    s = get_settings()
    return _create_token(str(user_id), "access", timedelta(minutes=s.access_token_expire_minutes))


def create_refresh_token(user_id: int) -> str:
    s = get_settings()
    return _create_token(str(user_id), "refresh", timedelta(days=s.refresh_token_expire_days))


def decode_token(token: str) -> dict[str, Any]:
    """解码并校验 JWT；失败抛 jwt.PyJWTError 子类。"""
    s = get_settings()
    return jwt.decode(token, s.jwt_secret, algorithms=[s.jwt_algorithm])
