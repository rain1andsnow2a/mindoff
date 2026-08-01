"""场景摘要兜底必须优先返回用户真实回应，而不是最后一段旁白。"""
from types import SimpleNamespace

from app.routers.scene.scenes import _fallback_key_quote


scene = SimpleNamespace(
    history=[
        {"turn": 1, "choice": "我先听你说"},
        {"turn": 2, "choice": "我想把那天没说完的话告诉你"},
    ],
    beats=[{"speaker": "旁白", "text": "风吹过院子，故事在这里停下。"}],
)

assert _fallback_key_quote(scene) == "我想把那天没说完的话告诉你"
print("scene summary fallback: all assertions passed")
