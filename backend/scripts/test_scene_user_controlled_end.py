"""场景不按轮数自动结束；AI 只能发出可拒绝的收束建议。"""
import json
from types import SimpleNamespace

from app.graphs import theater
import app.routers.scene.scenes as scene_router


def test_non_stream_never_auto_ends() -> None:
    original = theater._invoke_json
    theater._invoke_json = lambda *args, **kwargs: {
        "beats": [{"speaker": "旁白", "text": "风安静下来。"}],
        # 即使旧模型仍返回 ended=true 且不给选项，也不能替用户结束。
        "choices": [],
        "ended": True,
    }
    try:
        result = theater.advance(
            {"setting": "院子", "beats": [], "history": [], "turn": 999},
            "我还想继续说",
        )
    finally:
        theater._invoke_json = original

    assert result["ended"] is False
    assert result["choices"], "无论轮数多大都必须保留继续入口"


def test_stream_closure_is_only_a_signal() -> None:
    class FakeModel:
        def stream(self, messages):
            for text in (
                "你把那句话慢慢说完。###CHO",
                "ICES###再坐一会儿｜继续告诉她",
                "###CLOSURE###ready",
            ):
                yield SimpleNamespace(content=text)

    original = theater.get_chat_model
    theater.get_chat_model = lambda **kwargs: FakeModel()
    try:
        events = list(theater.stream_advance_tokens(
            {"setting": "院子", "beats": [], "history": [], "turn": 20},
            "我想把话说完",
        ))
    finally:
        theater.get_chat_model = original

    choices = next(value for kind, value in events if kind == "choices")
    closure = next(value for kind, value in events if kind == "closure")
    assert choices and all("CLOSURE" not in item["label"] for item in choices)
    assert closure is True


def test_route_gates_early_closure_but_never_ends() -> None:
    scene = SimpleNamespace(
        id=7,
        setting="院子",
        beats=[],
        choices=[],
        history=[],
        turn=0,
        render_kind="preset_3d",
    )

    class FakeDb:
        def get(self, model, scene_id):
            return scene

        def commit(self):
            return None

        def close(self):
            return None

    original_session = scene_router.SessionLocal
    original_stream = scene_router.theater.stream_advance_tokens
    scene_router.SessionLocal = lambda: FakeDb()
    scene_router.theater.stream_advance_tokens = lambda *args, **kwargs: iter([
        ("token", "风安静下来。"),
        ("choices", [{"id": "1", "label": "继续说"}]),
        ("closure", True),
    ])
    try:
        early_frames = list(scene_router._advance_stream_gen(scene.id, "第一句", 1))
        later_frames = list(scene_router._advance_stream_gen(scene.id, "第二句", 2, "custom"))
    finally:
        scene_router.SessionLocal = original_session
        scene_router.theater.stream_advance_tokens = original_stream

    def done(frames):
        frame = next(item for item in frames if item.startswith("event: done"))
        return json.loads(frame.split("data: ", 1)[1])

    early = done(early_frames)
    later = done(later_frames)
    assert early == {"scene_id": 7, "turn": 1, "ended": False, "closure_ready": False}
    assert later == {"scene_id": 7, "turn": 2, "ended": False, "closure_ready": True}
    assert scene.choices == [{"id": "1", "label": "继续说"}]
    assert scene.history[-1] == {"turn": 2, "choice": "第二句", "source": "custom"}


test_non_stream_never_auto_ends()
test_stream_closure_is_only_a_signal()
test_route_gates_early_closure_but_never_ends()
assert not hasattr(theater, "MAX_TURNS")
print("scene user-controlled ending: all assertions passed")
