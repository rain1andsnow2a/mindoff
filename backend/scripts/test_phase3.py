"""Phase 3 冒烟测试：做梦 Agent 端到端。"""
import httpx

B = "http://127.0.0.1:8014/api/v1"

# 注册
r = httpx.post(f"{B}/auth/register", json={"username": "dreamer", "password": "pass1234"})
if r.status_code == 409:
    r = httpx.post(f"{B}/auth/login", json={"username": "dreamer", "password": "pass1234"})
tok = r.json()["access_token"]
H = {"Authorization": f"Bearer {tok}"}
print("AUTH OK")

# 倾倒：包含多条 personal/vulnerable 同主题记忆（触发聚类+下沉）
dump_text = (
    "今天开会的时候领导当众批评了我的方案，我觉得特别丢人。"
    "其实我一直害怕在众人面前表现，怕别人觉得我不行。"
    "上次做汇报也是，紧张到手抖，觉得自己根本不配站在那个位置。"
    "明天下午两点要交周报。"
)
r2 = httpx.post(f"{B}/brain-dumps", json={"text": dump_text}, headers=H, timeout=60)
evts = [l for l in r2.text.split("\n") if l.startswith("event:")]
print(f"DUMP: {r2.status_code}, events={evts}")

# 手动触发作梦
r3 = httpx.post(f"{B}/debug/dream", headers=H, timeout=60)
print(f"DREAM: {r3.status_code}")
dream = r3.json()
print(f"  status={dream.get('status')}")
print(f"  recalled={dream.get('recalled')} clusters={dream.get('clusters')}")
print(f"  descents={dream.get('descents')} reconciled={dream.get('reconciled')}")
print(f"  forgotten={dream.get('forgotten')} candidates={dream.get('candidates')}")
print(f"  errors={dream.get('errors')}")

# 验证下沉产物
if dream.get("descents", 0) > 0:
    print("\n=== DESCENT VERIFIED: deeper hypothesis created ===")
else:
    print("\n=== No descent (may need more same-theme memories) ===")

print("\n=== Phase 3 TEST DONE ===")
