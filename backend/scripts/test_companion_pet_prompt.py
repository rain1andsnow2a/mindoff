"""DAY-198 单测：不同 pet_prompt 被组装进 system message。

不依赖 LLM/key，只测 _build_messages 的提示词分层。
"""
import sys

sys.path.insert(0, ".")

from app.graphs.companion import BASE_PERSONA, _build_messages


def test_build_messages_without_pet_prompt():
    msgs = _build_messages("free_chat", [{"role": "user", "content": "hi"}])
    assert len(msgs) == 2
    system = msgs[0].content
    assert BASE_PERSONA.strip() in system
    assert "## 你的人格与角色" not in system
    print("without pet_prompt: system only contains BASE_PERSONA + mode hint PASS")


def test_build_messages_with_pet_prompt():
    pet_prompt = "你是米露，情绪碎片收藏家。"
    msgs = _build_messages("free_chat", [{"role": "user", "content": "hi"}], pet_prompt=pet_prompt)
    system = msgs[0].content
    assert BASE_PERSONA.strip() in system
    assert "## 你的人格与角色" in system
    assert pet_prompt in system
    # BASE_PERSONA 应在人格层之前（最外层）
    assert system.index(BASE_PERSONA.strip()) < system.index(pet_prompt)
    print("with pet_prompt: system contains BASE_PERSONA + personality layer PASS")


def test_mode_hint_and_memory_still_present():
    pet_prompt = "你是波比，晨光信使。"
    memory_ctx = "- [记忆] 用户昨天很累"
    frag = "一段回看片段"
    msgs = _build_messages(
        "review_fragment",
        [{"role": "user", "content": "hi"}],
        fragment_context=frag,
        memory_context=memory_ctx,
        pet_prompt=pet_prompt,
    )
    system = msgs[0].content
    assert pet_prompt in system
    assert memory_ctx in system
    assert frag in system
    assert "review_fragment" not in system.lower()  # mode hint 是中文
    print("mode hint + memory + fragment + pet_prompt: all injected PASS")


if __name__ == "__main__":
    test_build_messages_without_pet_prompt()
    test_build_messages_with_pet_prompt()
    test_mode_hint_and_memory_still_present()
    print("\n=== Companion Pet Prompt (DAY-198) ALL PASS ===")
