"""DAY-164 记忆 CRUD 冒烟：鉴权隔离 + 单条改删 + 清空全部。"""
import httpx

B = "http://127.0.0.1:8010/api/v1"

u = {"username": "mem_smoke", "password": "pass1234"}
r = httpx.post(f"{B}/auth/register", json=u)
if r.status_code == 409:
    r = httpx.post(f"{B}/auth/login", json=u)
H = {"Authorization": f"Bearer {r.json()['access_token']}"}
print("AUTH:", r.status_code)

# 无 token → 401
assert httpx.get(f"{B}/memories").status_code in (401, 403)
print("NO-AUTH blocked OK")

# 新建两条
ids = []
for i in range(2):
    rc = httpx.post(f"{B}/memories", headers=H, json={
        "layer": "episodic", "kind": "灵感", "depth": "surface",
        "content": f"点子 {i}", "surface_text": f"你冒出点子 {i}"})
    assert rc.status_code == 201, rc.text
    ids.append(rc.json()["id"])
print("CREATE x2:", ids)

# 列表包含
lst = httpx.get(f"{B}/memories", headers=H).json()
assert all(i in [m["id"] for m in lst] for i in ids)
print("LIST:", len(lst))

# 单条
g = httpx.get(f"{B}/memories/{ids[0]}", headers=H)
assert g.status_code == 200
# PATCH 走版本链
p = httpx.patch(f"{B}/memories/{ids[0]}", headers=H, json={"content": "改过的点子"})
assert p.status_code == 200 and p.json()["version"] == 2, p.text
print("PATCH version:", p.json()["version"])

# DELETE 单条
d = httpx.delete(f"{B}/memories/{ids[1]}", headers=H)
assert d.status_code == 204
assert httpx.get(f"{B}/memories/{ids[1]}", headers=H).status_code == 404
print("DELETE single OK (now 404)")

# 跨用户隔离：另一个用户看不到、删不了
u2 = {"username": "mem_smoke2", "password": "pass1234"}
r2 = httpx.post(f"{B}/auth/register", json=u2)
if r2.status_code == 409:
    r2 = httpx.post(f"{B}/auth/login", json=u2)
H2 = {"Authorization": f"Bearer {r2.json()['access_token']}"}
assert httpx.get(f"{B}/memories/{ids[0]}", headers=H2).status_code == 404
print("CROSS-USER isolation OK")

# 清空全部
c = httpx.delete(f"{B}/memories", headers=H)
assert c.status_code == 200, c.text
print("CLEAR ALL:", c.json())
assert httpx.get(f"{B}/memories", headers=H).json() == []
print("LIST after clear: empty OK")

print("\n=== DAY-164 ALL PASS ===")
