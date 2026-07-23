"""给 LangGraph 用的聊天模型工厂：LangChain 的 OpenAI 接口指向阶跃。

下一层写编排图时：
    from app.llm import get_chat_model
    model = get_chat_model().bind_tools([...])
"""
from typing import Optional

from langchain_openai import ChatOpenAI

from app.config import get_settings


def get_chat_model(model: Optional[str] = None, **kwargs) -> ChatOpenAI:
    s = get_settings()
    return ChatOpenAI(
        model=model or s.step_text_model,
        api_key=s.stepfun_api_key,
        base_url=s.stepfun_base_url,
        **kwargs,
    )
