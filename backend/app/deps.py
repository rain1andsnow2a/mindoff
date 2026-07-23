"""FastAPI 鉴权依赖。

其他路由做 user 隔离时：
    from app.deps import get_current_user
    def list_todos(user: User = Depends(get_current_user)): ...
把之前的 `user_id=1` 占位替换成 `user.id` 即可。
"""
import jwt
from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy.orm import Session

from app.core.security import decode_token
from app.db import get_db
from app.models.user import User

_bearer = HTTPBearer(auto_error=True)


def get_current_user(
    creds: HTTPAuthorizationCredentials = Depends(_bearer),
    db: Session = Depends(get_db),
) -> User:
    cred_exc = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="无效或过期的凭证",
        headers={"WWW-Authenticate": "Bearer"},
    )
    try:
        payload = decode_token(creds.credentials)
        if payload.get("type") != "access":
            raise cred_exc
        user_id = int(payload["sub"])
    except (jwt.PyJWTError, KeyError, ValueError):
        raise cred_exc

    user = db.get(User, user_id)
    if user is None or not user.is_active:
        raise cred_exc
    return user
