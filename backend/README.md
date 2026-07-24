# MindOff 后端

FastAPI + SQLAlchemy(SQLite) + LangGraph。分两层：

- **AI 网关 `/ai/*`**：阶跃星辰的文本/语音转写/实时通话封装，API key 只留服务端。
- **业务层 `/api/v1/*`**：账号、对话、睡前倾倒、双轴记忆、信箱、桌宠等，全部
  `Authorization: Bearer <token>` 按用户隔离。接口契约见 [docs/api-design.md](docs/api-design.md)，
  记忆系统规格见 `../.kiro/specs/memory-system/`。

## 快速开始

```bash
cd backend
cp .env.example .env          # 填 STEPFUN_API_KEY；JWT_SECRET 生产必改
uv sync                       # 装依赖（或直接 .venv/Scripts/python.exe）
uv run uvicorn app.main:app --reload   # 默认 http://127.0.0.1:8000
```

启动时自动 `create_all` 建表（dev）；生产走 Alembic：`uv run alembic upgrade head`。

## 业务接口一览（/api/v1）

| 资源 | 路径 | 状态 |
|---|---|---|
| 账号 | `/auth/register|login|refresh|logout`、`/users/me` | ✅ |
| 对话 | `/conversations[/{id}[/messages]]`（`?stream=true` 走 SSE） | ✅ |
| 睡前倾倒 | `POST /brain-dumps`（SSE 流式回执）、`GET /brain-dumps/{id}` | ✅ |
| 五类存储 | `/todos`、`/summaries`、`/ideas`、`/emotions` | ✅ |
| 记忆 | `/memories`（CRUD+清空）、`/memory-review`（审阅面·软标签） | ✅ |
| 信箱 | `/mailbox`、`/letters`、`/ephemeral`、`/treasures` | ✅ |
| 桌宠 | `/pets[/presets|/active|/{id}]`（切换触发交接信） | ✅ |
| 交接信 | `/handoffs[/{id}]`（只读） | ✅ |
| 片场 | `/candidates`、`/scenes`（含 templates/plays/calibrate/settlement） | ✅ |

## 验证（需先启动服务）

```bash
uv run python scripts/smoke_test.py          # 网关：/health + /ai/chat
uv run python scripts/ws_smoke.py            # 网关：/ai/realtime 链路
uv run python scripts/auth_smoke.py          # 账号全流程
uv run python scripts/test_conversations.py  # 对话 + 从会话生成倾倒
uv run python scripts/test_brain_dumps.py    # 倾倒 SSE + 回执回取
uv run python scripts/test_pets.py           # 桌宠 + 交接信
uv run python scripts/test_mailbox_ext.py    # 来信/三日寄存/珍藏
uv run python scripts/test_memories.py       # 记忆 CRUD
uv run python scripts/test_stores.py         # 五类存储（待办/小结/灵感/情绪）
uv run python scripts/handoff_smoke.py       # 交接信
uv run python scripts/test_phase2.py         # 记忆 phase2（信箱交还）
uv run python scripts/test_phase3.py         # 记忆 phase3（做梦 Agent）
```

service 层测试（免启动服务，需 `PYTHONPATH=.`）：

```bash
uv run python scripts/test_stage.py            # 片场供给/结算
uv run python scripts/test_proactive.py        # 信任门控
uv run python scripts/test_phase6.py           # 隐私/上下文/审阅（含 HTTP 段，需服务）
uv run python scripts/test_burn_raw.py         # keep_raw_dump→burn_raw_ref 焚原文 + 情绪落 7 天 TTL
uv run python scripts/test_ephemeral_weekly.py # 到期硬删（行+历史）+ 周报生成/幂等
```

> Windows 控制台跑脚本请加 `PYTHONUTF8=1`（否则 emoji print 报 GBK 编码错）。

## 开发约定（踩过的坑）

1. **dev 库由 `create_all` 建**：不会给已存在的表加列。改列需手动 ALTER 或删
   `mindoff.db` 重建；新表无需处理。Alembic 迁移（`alembic/versions/`）是 prod 路径，
   模型/字段变更要同步写迁移，revision id ≤ 32 字符。
2. **新模型要注册** `app/models/__init__.py`；**新 router 要挂载** `app/main.py`。
3. `--reload` 监视整个目录：写 `scripts/*.py` 会触发重启，先建好文件再测。
4. 桌宠/片段等跨表引用暂用裸 Integer + 名称快照，不设 FK（与 user_id 先例一致）。

## 红线

- 不向用户输出心理诊断/人格标签/冰山层名；深层假设一律不确定措辞 + provenance。
- vulnerable/core 记忆默认 privacy=local，外发（同步/外部 Provider）必须过
  `app/services/privacy.py` 的 `can_send_external`。
- **检索纯本地、无向量库**（hermes 式架构）：召回 = 结构化分层 + 关键词/实体匹配，
  做梦聚类 = 纯 entity 交集。私密内容没有任何外发路径。
- 来信每天 ≤1–2 封；每周日 20:00（东八区）投一封周报（`type=weekly`，只取 surface 素材）。
- 寄存 7 天（`inbox.EPHEMERAL_TTL_DAYS`）到期**硬删**：物理删记忆行 + 历史行，不留人物/地点/原话/事件
  （`inbox._hard_delete_memory`；Property 4 的受限例外，仅到期寄存）。
- 原始倾诉按用户 `keep_raw_dump` 开关：关则提取成功后即焚 `raw_ref`（含语音，走 `privacy.burn_raw_ref`），
  仅留整理后的 `surface_text`；提取失败不焚（先接住用户）。agent 上下文只读 `surface_text`，焚原文不影响记忆连续性。
