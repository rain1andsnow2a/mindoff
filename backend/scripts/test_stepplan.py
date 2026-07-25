"""快速验证 Step Plan 额度是否可用。

用法：cd backend && uv run python scripts/test_stepplan.py
"""
import sys, os
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
os.environ.setdefault("PYTHONUTF8", "1")

from app.config import get_settings
from app.llm import get_chat_model

s = get_settings()
print(f"[config] base_url = {s.stepfun_base_url}")
print(f"[config] model    = {s.step_text_model}")
print(f"[config] api_key  = {s.stepfun_api_key[:8]}...{s.stepfun_api_key[-4:]}")
print()

model = get_chat_model(temperature=0.5, max_retries=1, timeout=15)

try:
    resp = model.invoke([{"role": "user", "content": "Hi, reply with exactly: STEP_PLAN_OK"}])
    content = resp.content.strip()
    print(f"[result] model response: {content}")
    if "STEP_PLAN" in content or "OK" in content:
        print("\n✅ Step Plan 调用成功！额度可用。")
    else:
        print(f"\n✅ Step Plan 调用成功（模型返回了内容）。")
except Exception as e:
    print(f"\n❌ 调用失败: {type(e).__name__}: {e}")
    if "401" in str(e) or "auth" in str(e).lower():
        print("   → API Key 可能不是 Step Plan 专用 Key，请检查是否已订阅 Step Plan。")
    elif "404" in str(e):
        print("   → 端点不存在，请确认 base_url 是否正确。")
    elif "429" in str(e):
        print("   → 额度用尽或被限流。")
    sys.exit(1)
