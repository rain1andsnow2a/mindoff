"""应用日志安全工具。"""
import logging
import re

_QUERY_TOKEN = re.compile(r"([?&]token=)[^&\s\"]+", re.IGNORECASE)


def redact_access_token(value: str) -> str:
    """隐藏 URL 查询参数中的访问令牌，同时保留其余请求信息。"""
    return _QUERY_TOKEN.sub(r"\1[REDACTED]", value)


class AccessTokenRedactionFilter(logging.Filter):
    def filter(self, record: logging.LogRecord) -> bool:
        if isinstance(record.msg, str):
            record.msg = redact_access_token(record.msg)
        if isinstance(record.args, tuple):
            record.args = tuple(
                redact_access_token(item) if isinstance(item, str) else item
                for item in record.args
            )
        elif isinstance(record.args, dict):
            record.args = {
                key: redact_access_token(item) if isinstance(item, str) else item
                for key, item in record.args.items()
            }
        return True


def install_access_token_redaction() -> None:
    """为 Uvicorn HTTP/WS 请求日志安装一次 token 脱敏过滤器。"""
    for logger_name in ("uvicorn.error", "uvicorn.access"):
        target = logging.getLogger(logger_name)
        if any(isinstance(item, AccessTokenRedactionFilter) for item in target.filters):
            continue
        target.addFilter(AccessTokenRedactionFilter())
