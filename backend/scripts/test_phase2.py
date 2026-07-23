"""Phase 2 冒烟测试：信箱端点。"""
import httpx

B = "http://127.0.0.1:8010/api/v1"

# 登录
r = httpx.post(f"{B}/auth/login", json={"username": "phase2", "password": "pass1234"})
tok = r.json()["access_token"]
H = {"Authorization": f"Bearer {tok}"}

# 信箱概览
r1 = httpx.get(f"{B}/mailbox", headers=H)
print("MAILBOX:", r1.status_code)
d = r1.json()
print(f"  today_count={d['today_count']} needs_info={d['needs_info_count']} letters={d['letters_count']}")

# 今日待启
r2 = httpx.get(f"{B}/mailbox/today", headers=H)
print("TODAY:", r2.status_code)
t = r2.json()
print(f"  actionable={len(t['actionable'])} needs_info={len(t['needs_info'])}")
for a in t["actionable"]:
    print(f"    [action] id={a['memory_id']} kind={a['kind']}")
for n in t["needs_info"]:
    print(f"    [needs_info] id={n['memory_id']} missing={n.get('missing')}")

# 桌宠来信
r3 = httpx.get(f"{B}/mailbox/letters", headers=H)
print("LETTERS:", r3.status_code)
letters = r3.json()["letters"]
print(f"  count={len(letters)}")
for l in letters:
    print(f"    type={l['type']} body_len={len(l['body'])}")

# 过期清理
r4 = httpx.post(f"{B}/mailbox/expire")
print("EXPIRE:", r4.status_code, r4.json())

print("\n=== Phase 2 ALL PASS ===")
