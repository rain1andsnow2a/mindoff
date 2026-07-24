"""DAY-198 冒烟：米露/波比预设带 system_prompt，API 返回并随对话生效。

先启动服务：cd backend && uv run uvicorn app.main:app --port 8011
再运行：cd backend && uv run python scripts/test_pet_prompts.py
"""
import httpx

B = "http://127.0.0.1:8011/api/v1"


def auth(username: str) -> dict:
    u = {"username": username, "password": "pass1234"}
    r = httpx.post(f"{B}/auth/register", json=u)
    if r.status_code == 409:
        r = httpx.post(f"{B}/auth/login", json=u)
    assert r.status_code in (200, 201), r.text
    return {"Authorization": f"Bearer {r.json()['access_token']}"}


H = auth("pet_prompt_smoke")

# 1. 预设列表：米露 / 波比，都带 system_prompt
r = httpx.get(f"{B}/pets/presets", headers=H)
assert r.status_code == 200, r.text
presets = {p["id"]: p for p in r.json()}
assert "miro" in presets and "bobi" in presets, presets.keys()
assert "情绪碎片收藏家" in presets["miro"]["system_prompt"]
assert "晨光信使" in presets["bobi"]["system_prompt"]
print("PRESETS: miro/bobi with system_prompt PASS")

# 2. 激活米露 → 实例化 Pet 带 system_prompt
r = httpx.put(f"{B}/pets/active", headers=H, json={"petId": "miro"}, timeout=60)
assert r.status_code == 200, r.text
miro_pet = r.json()["pet"]
assert miro_pet["preset_id"] == "miro"
assert "情绪碎片收藏家" in miro_pet["system_prompt"]
print("ACTIVATE miro: pet.system_prompt returned PASS")

# 3. GET /pets/active 也返回 system_prompt
r = httpx.get(f"{B}/pets/active", headers=H)
assert r.status_code == 200
assert r.json()["system_prompt"] == miro_pet["system_prompt"]
print("GET active pet: system_prompt returned PASS")

# 4. 切换波比 → 验证不同人设
r = httpx.put(f"{B}/pets/active", headers=H, json={"petId": "bobi"}, timeout=60)
assert r.status_code == 200, r.text
bobi_pet = r.json()["pet"]
assert bobi_pet["preset_id"] == "bobi"
assert "晨光信使" in bobi_pet["system_prompt"]
assert bobi_pet["system_prompt"] != miro_pet["system_prompt"]
print("SWITCH bobi: different system_prompt PASS")

# 5. PATCH 可定制 system_prompt
r = httpx.patch(f"{B}/pets/{bobi_pet['id']}", headers=H,
                json={"system_prompt": "定制后的波比人设"})
assert r.status_code == 200, r.text
assert r.json()["system_prompt"] == "定制后的波比人设"
print("PATCH system_prompt PASS")

# 6. 对话接口使用当前主桌宠人设（不依赖 LLM，只看端点 200 + 持久化）
r = httpx.post(f"{B}/conversations", headers=H,
               json={"mode": "free_chat", "pet_id": bobi_pet["id"]})
assert r.status_code == 201, r.text
conv = r.json()
r = httpx.post(f"{B}/conversations/{conv['id']}/messages", headers=H,
               json={"text": "今天有点累。"}, timeout=60)
assert r.status_code == 200, r.text
assert r.json()["reply"]["content"]
print("CONVERSATION uses pet system_prompt PASS")

print("\n=== Pet Prompts (DAY-198 smoke) ALL PASS ===")
