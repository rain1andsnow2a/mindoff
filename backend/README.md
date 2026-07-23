# MindOff AI 网关（基础层）

MindOff 全项目的模型调用统一走**阶跃星辰**。本服务是 AI 基础层：把阶跃的
**文本 / 语音转文字 / 实时通话**封装成前端（React Native）可直连的接口，
**API key 只留服务端**，前端永远拿不到。

## 快速开始

```bash
cd backend
cp .env.example .env          # 然后把 STEPFUN_API_KEY 填成真实 key
uv sync                        # 装依赖
uv run uvicorn app.main:app --reload   # 启动，默认 http://127.0.0.1:8000
```

## 接口

| 方法 | 路径 | 说明 |
|---|---|---|
| GET | `/health` | 存活检查（含 key 是否加载、默认模型） |
| POST | `/ai/chat` | 文本。body `{messages, model?, tools?, tool_choice?, temperature?, stream?}`；`stream:true` 返回 SSE。支持 tool calling |
| POST | `/ai/stt` | 一次性识别。multipart：`file` + `type`(wav/mp3/pcm/ogg) + pcm 时的 `rate/bits/channel` + `language` |
| WS | `/ai/stt/stream` | 边说边转。按阶跃协议发 `session.update` / `input_audio_buffer.append`(base64 pcm)，回传 `transcription.delta/completed` |
| WS | `/ai/realtime` | 桌宠实时语音。网关自动注入鉴权 + 默认 session（人设/音色/server_vad/pcm16），RN 可发 `session.update` 覆盖 |

### ⚠️ 给前端的关键约定
- 流式识别的 `transcription.delta.text` 是**累计全量文本**，**整体替换展示，不要追加拼接**。
- 实时语音音频输入/输出均为 **pcm16 + base64**。
- `voice` 音色不可中途更改（阶跃限制），首帧 session 定好。

## 验证

```bash
# 需先启动服务
uv run python scripts/smoke_test.py   # /health + /ai/chat（普通/tool/SSE）
uv run python scripts/ws_smoke.py     # /ai/realtime 握手+鉴权+中继链路
```

语音**全链路**（真麦克风→转录/语音回复）需 RN 真机带麦联调；本地脚本只验证到
网关↔阶跃 WS 链路通。

## 分层与下一步
- 本层：模型接入原语（网关）。
- 下一层：LangGraph 编排图（睡前分类 / 来信门控 / 剧情状态机 / 记忆 TTL），
  通过 `app/llm.py` 的 `get_chat_model()` 接入阶跃。
