"""「走出片场」回看：AI 候选可降级，事实统计必须来自场景记录。"""
from types import SimpleNamespace

from app.graphs import theater
import app.routers.scene.scenes as scene_router


def test_reflection_options_are_normalized() -> None:
    options = theater._norm_reflection_options([
        "  我希望这句话被听见。 ",
        "我希望这句话被听见",
        "那时的我不知道怎么表达",
        "第四条不会展示",
    ])
    assert options == [
        "我希望这句话被听见",
        "那时的我不知道怎么表达",
        "第四条不会展示",
    ]
    assert len(theater._norm_reflection_options(None)) == 3


def test_summary_adds_deterministic_scene_facts() -> None:
    scene = SimpleNamespace(
        id=9,
        user_id=3,
        title="老屋檐下的风",
        setting="傍晚的老屋院子",
        beats=[{"speaker": "旁白", "text": "风停在屋檐下。"}],
        history=[
            {"turn": 1, "choice": "我先听你说", "source": "choice"},
            {"turn": 2, "choice": "其实我一直很想你", "source": "custom"},
        ],
    )
    original_get_owned = scene_router._get_owned
    original_summarize = scene_router.theater.summarize
    scene_router._get_owned = lambda db, user_id, scene_id: scene
    scene_router.theater.summarize = lambda payload: {
        "key_quote": "……",
        "reflection_options": ["我希望自己的想念被听见"],
        "companion_comment": "先把它放在这里。",
        "action_hint": "下次可以先说出想念",
    }
    try:
        result = scene_router.scene_summary(
            scene.id,
            user=SimpleNamespace(id=scene.user_id),
            db=object(),
        )
    finally:
        scene_router._get_owned = original_get_owned
        scene_router.theater.summarize = original_summarize

    assert result["key_quote"] == "其实我一直很想你"
    assert result["response_count"] == 2
    assert result["custom_response_count"] == 1
    assert result["setting_label"] == "傍晚的老屋院子"


test_reflection_options_are_normalized()
test_summary_adds_deterministic_scene_facts()
print("scene exit review: all assertions passed")
