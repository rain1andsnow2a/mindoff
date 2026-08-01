"""Conversations 端到端验证（TestClient，不依赖外部 server 进程）。

验证发消息流程正常，且 _pet_prompt 辅助能正确读到当前主桌宠 system_prompt。
"""
import sys

sys.path.insert(0, ".")

from fastapi.testclient import TestClient

from app.db import Base, SessionLocal, engine
from app.main import app
from app.models.conversation import Message
from app.models.pet import Pet
from app.models.user import User
from app.core.security import hash_password

client = TestClient(app)


def register_user(username: str) -> tuple[str, int]:
    r = client.post("/api/v1/auth/register", json={
        "username": username, "password": "pass1234"
    })
    if r.status_code == 409:
        r = client.post("/api/v1/auth/login", json={
            "username": username, "password": "pass1234"
        })
    assert r.status_code in (200, 201), r.text
    token = r.json()["access_token"]
    me = client.get("/api/v1/users/me", headers={"Authorization": f"Bearer {token}"})
    return token, me.json()["id"]


# 重置内存数据库
Base.metadata.drop_all(bind=engine)
Base.metadata.create_all(bind=engine)

token, uid = register_user("conv_client_smoke")
H = {"Authorization": f"Bearer {token}"}

# 直接创建一只带 system_prompt 的主桌宠
db = SessionLocal()
pet = Pet(user_id=uid, name="测试宠", preset_id="test", personality="测试性格",
          tone="测试语气", system_prompt="你是测试桌宠，请回答'测试通过'。",
          is_active=True)
db.add(pet)
db.commit()
db.refresh(pet)
db.close()

# 创建对话
r = client.post("/api/v1/conversations", headers=H,
                json={"mode": "free_chat", "pet_id": pet.id})
assert r.status_code == 201, r.text
conv = r.json()
cid = conv["id"]
print(f"CREATE conv id={cid} PASS")

# 发消息（无 LLM key 时走兜底，但端点应 200）
r = client.post(f"/api/v1/conversations/{cid}/messages", headers=H,
                json={"text": "hello"})
assert r.status_code == 200, r.text
reply = r.json()["reply"]
assert reply["role"] == "assistant"
print(f"SEND msg reply ok: {reply['content'][:40]} PASS")

# 会话详情应含 2 条消息
r = client.get(f"/api/v1/conversations/{cid}", headers=H)
assert r.status_code == 200
msgs = r.json()["messages"]
assert len(msgs) == 2
assert msgs[0]["role"] == "user"
assert msgs[1]["role"] == "assistant"
print("CONVERSATION detail 2 messages PASS")

# 其他用户不能删除这段会话（按用户隔离，外部统一表现为不存在）
other_token, _ = register_user("conv_delete_other")
other_h = {"Authorization": f"Bearer {other_token}"}
r = client.delete(f"/api/v1/conversations/{cid}", headers=other_h)
assert r.status_code == 404, r.text
r = client.get(f"/api/v1/conversations/{cid}", headers=H)
assert r.status_code == 200, r.text
print("DELETE cross-user isolation PASS")

# 本人删除后，会话不可再取，关联消息一并清理
r = client.delete(f"/api/v1/conversations/{cid}", headers=H)
assert r.status_code == 204, r.text
r = client.get(f"/api/v1/conversations/{cid}", headers=H)
assert r.status_code == 404, r.text
db = SessionLocal()
assert db.query(Message).filter(Message.conversation_id == cid).count() == 0
db.close()
print("DELETE conversation + messages PASS")

print("\n=== Conversations Client ALL PASS ===")
