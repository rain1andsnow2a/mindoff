"""探测 Step Plan（api.stepfun.com/step_plan/v1）下各能力可用的模型名。

Step Plan 订阅页列出的可用模型与标准 /v1 不同（例：TTS 是 stepaudio-2.5-tts
而不是 step-tts-mini），本脚本逐个试，输出该往 .env 里写什么。
"""
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
JH = {**H, "Content-Type": "application/json"}
PLAN = "https://api.stepfun.com/step_plan/v1"
STD = "https://api.stepfun.com/v1"


def probe_tts(base: str, model: str, voice: str) -> str:
    try:
        r = httpx.post(f"{base}/audio/speech", headers=JH, timeout=90, json={
            "model": model, "input": "测试一下语音", "voice": voice, "response_format": "mp3",
        })
        if r.status_code == 200:
            return f"OK  {len(r.content)} bytes mp3"
        return f"{r.status_code}  {r.text[:150]}"
    except Exception as e:  # noqa: BLE001
        return f"ERR {e}"


def probe_chat(base: str, model: str) -> str:
    try:
        r = httpx.post(f"{base}/chat/completions", headers=JH, timeout=90, json={
            "model": model, "messages": [{"role": "user", "content": "说一句你好"}],
        })
        if r.status_code == 200:
            return "OK  " + r.json()["choices"][0]["message"]["content"][:30]
        return f"{r.status_code}  {r.text[:150]}"
    except Exception as e:  # noqa: BLE001
        return f"ERR {e}"


def probe_image(base: str, model: str) -> str:
    try:
        r = httpx.post(f"{base}/images/generations", headers=JH, timeout=180, json={
            "model": model, "prompt": "a quiet warm room", "size": "1024x1024",
            "steps": 8, "cfg_scale": 1.0, "response_format": "b64_json",
        })
        if r.status_code == 200:
            return "OK  has b64"
        return f"{r.status_code}  {r.text[:150]}"
    except Exception as e:  # noqa: BLE001
        return f"ERR {e}"


print("=== TTS /audio/speech ===")
for base_name, base in (("step_plan", PLAN), ("std", STD)):
    for model in ("stepaudio-2.5-tts", "step-tts-mini"):
        for voice in ("yuanqishaonv", "linjiajiejie"):
            print(f"  {base_name:9s} {model:20s} voice={voice:14s} -> {probe_tts(base, model, voice)}")

print("\n=== CHAT /chat/completions ===")
for base_name, base in (("step_plan", PLAN), ("std", STD)):
    for model in ("step-3.5-flash", "step-3.7-flash", "stepaudio-2.5-chat"):
        print(f"  {base_name:9s} {model:20s} -> {probe_chat(base, model)}")

print("\n=== IMAGE /images/generations ===")
for base_name, base in (("step_plan", PLAN), ("std", STD)):
    print(f"  {base_name:9s} step-image-edit-2    -> {probe_image(base, 'step-image-edit-2')}")

print("\n当前 .env 相关配置：")
for k in ("STEPFUN_BASE_URL", "STEPFUN_WS_BASE", "STEP_TEXT_MODEL", "STEP_TTS_MODEL",
          "STEP_TTS_VOICE", "STEP_ASR_FILE_MODEL", "STEP_ASR_STREAM_MODEL",
          "STEP_REALTIME_MODEL", "STEP_IMAGE_MODEL"):
    print(f"  {k} = {env.get(k, '(未设置，用代码默认)')}")
