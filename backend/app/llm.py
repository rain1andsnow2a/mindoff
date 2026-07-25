"""给 LangGraph 用的聊天模型工厂：LangChain 的 OpenAI 接口指向阶跃。

下一层写编排图时：
    from app.llm import get_chat_model
    model = get_chat_model().bind_tools([...])

限流说明：阶跃当前账号是阶梯限速（实测 RPM=10）。一次用户操作常会连打好几次
LLM（例：建场景 = 剧本 + 两段图 prompt + 视觉判定；推进 = 剧情 + 视觉判定），
加上每 5 分钟的主动信号扫描，很容易瞬时撞到 429。这里把重试次数调高，
让 SDK 自己按指数退避重试，避免一撞限流就掉进兜底文案。
调用方仍需保留兜底——重试用完还是会失败。
"""
from typing import Optional

from langchain_openai import ChatOpenAI

from app.config import get_settings

# openai SDK 对 429/5xx 会自动指数退避重试；默认 2 次对 RPM=10 的账号不够
DEFAULT_MAX_RETRIES = 5
# 单次请求超时（秒）。留足退避空间，又不至于把 SSE 流挂死
DEFAULT_TIMEOUT = 60


def get_chat_model(model: Optional[str] = None, **kwargs) -> ChatOpenAI:
    s = get_settings()
    kwargs.setdefault("max_retries", DEFAULT_MAX_RETRIES)
    kwargs.setdefault("timeout", DEFAULT_TIMEOUT)
    return ChatOpenAI(
        model=model or s.step_text_model,
        api_key=s.stepfun_api_key,
        base_url=s.stepfun_base_url,
        **kwargs,
    )
