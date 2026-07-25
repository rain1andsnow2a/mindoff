"""补测：改图 /images/edits 与一次性识别 /audio/asr/sse 在 step_plan 下是否可用。"""
import base64
import json
from pathlib import Path

import httpx

env = {}
for line in Path(".env").read_text(encoding="utf-8").splitlines():
    line = line.strip()
    if "=" in line and not line.startswith("#"):
        k, v = line.split("=", 1)
        env[k.strip()] = v.strip()
H = {"Authorization": "Bearer " + env["STEPFUN_API_KEY"]}
PLAN = "https://api.stepfun.com/step_plan/v1"
STD = "https://api.stepfun.com/v1"

# 先用文生图拿一张图当改图的输入
seed = httpx.post(f"{STD}/images/generations", headers={**H, "Content-Type": "application/json"},
                  timeout=180, json={"model": "step-image-edit-2", "prompt": "a quiet warm room",
                                     "size": "1024x1024", "steps": 8, "cfg_scale": 1.0,
                                     "response_format": "b64_json"}).json()
img = base64.b64decode(seed["data"][0]["b64_json"])
print(f"seed image: {len(img)} bytes\n")

print("=== /images/edits ===")
for name, base in (("step_plan", PLAN), ("std", STD)):
    try:
        r = httpx.post(f"{base}/images/edits", headers=H, timeout=180,
                       files={"image": ("in.png", img, "image/png")},
                       data={"model": "step-image-edit-2", "prompt": "把窗外改成下雨，光线转冷",
                             "response_format": "b64_json", "steps": "8", "cfg_scale": "1.0"})
        print(f"  {name:9s} -> {r.status_code} " +
              ("OK has b64" if r.status_code == 200 else r.text[:160]))
    except Exception as e:  # noqa: BLE001
        print(f"  {name:9s} -> ERR {e}")

print("\n=== /audio/asr/sse ===")
# 用刚才 TTS 生成的音频当输入
tts = httpx.post(f"{STD}/audio/speech", headers={**H, "Content-Type": "application/json"},
                 timeout=90, json={"model": "stepaudio-2.5-tts", "input": "今天天气很好",
                                   "voice": "yuanqishaonv", "response_format": "mp3"})
audio_b64 = base64.b64encode(tts.content).decode()
for name, base in (("step_plan", PLAN), ("std", STD)):
    for model in ("stepaudio-2.5-asr",):
        try:
            r = httpx.post(f"{base}/audio/asr/sse", headers={**H, "Content-Type": "application/json"},
                           timeout=120, json={"model": model, "audio": audio_b64,
                                              "format": {"type": "mp3"}, "language": "zh"})
            body = r.text[:200].replace("\n", " ")
            print(f"  {name:9s} {model:20s} -> {r.status_code} {body}")
        except Exception as e:  # noqa: BLE001
            print(f"  {name:9s} {model:20s} -> ERR {e}")
