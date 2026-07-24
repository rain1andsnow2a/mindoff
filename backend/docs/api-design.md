# MindOff 后端 REST API 设计

> 依据《MindOff 项目功能文档》反推的领域资源与接口。原则：RESTful、资源名词复数、
> 标准动词（GET/POST/PATCH/DELETE）、状态流转优先用 `PATCH status` 或子资源动作。
> ★ = 黑客松原型核心（文档 §7）；○ = 完善期。

## 0. 全局约定

- **Base path**：`/api/v1`
- **两层关系**：本 REST 是**业务层**；实时/流式能力走已建的 **AI 网关** `/ai/*`
  （`/ai/chat`、`/ai/stt`、`/ai/stt/stream`、`/ai/realtime`）。业务层内部调用 LangGraph +
  AI 网关，不把 key 暴露给前端。
- **用户模型（已定：多用户+账号）**：所有业务资源都加 `Authorization: Bearer <token>`
  并**按登录用户隔离**。URL 里不放 userId（从 token 解析）。见 §1 Auth。
- **AI 重活走 SSE 流式回执（已定）**：睡前分类、场景生成/推进这类耗时任务，创建类接口
  直接返回 `text/event-stream`，边处理边推事件（如逐条 `item.classified` → 最后 `receipt`/`done`），
  同时把结果持久化，之后可用 `GET` 回取。前端体验"边整理边看到结果落位"。
- **通用**：时间 ISO-8601；列表分页 `?limit=&cursor=`；隐私资源软删除；错误体
  `{ "error": { "code", "message" } }`。

---

## A. 账号 Auth（多用户）★

| 方法 | 路径 | 说明 |
|---|---|---|
| POST | `/auth/register` ★ | 注册 `{ ... }` → 返回 token |
| POST | `/auth/login` ★ | 登录 → 返回 `{ accessToken, refreshToken? }` |
| POST | `/auth/refresh` ○ | 刷新 token |
| POST | `/auth/logout` ○ | 注销 |
| GET | `/users/me` ★ | 当前用户信息 |
| PATCH | `/users/me` ○ | 修改资料 |

> 除 `/auth/register`、`/auth/login` 外，所有接口都要求 `Authorization: Bearer <token>`，
> 资源按 token 里的用户隔离。桌宠、记忆、信箱等全部 user-scoped。

## 1. 陪伴首页 Companion ★

| 方法 | 路径 | 说明 |
|---|---|---|
| GET | `/companion/home` ★ | 首页聚合：当前桌宠、它此刻在做什么（behavior：打盹/听歌/歪头…）、是否有轻量邀请 |

> 首页"每日新鲜感"的桌宠行为由服务端按时间/上下文计算，前端只读。

## 2. 桌宠 Pets ★ — ✅ 已实现

| 方法 | 路径 | 说明 |
|---|---|---|
| GET | `/pets/presets` ★ | 预设桌宠列表（性格/语气/动作组合） |
| GET | `/pets` ★ | 我拥有/已定制的桌宠 |
| GET | `/pets/{id}` ★ | 桌宠详情 |
| PATCH | `/pets/{id}` ○ | 修改定制 |
| DELETE | `/pets/{id}` ○ | 删除 |
| GET | `/pets/active` ★ | 当前主桌宠 |
| PUT | `/pets/active` ★ | 切换主桌宠 `{petId}` → **触发交接信生成**，响应带最新 handoff |

> 已实现（`app/routers/pets.py`、`app/services/pet_store.py` + `pet_presets.py` + `handoff_letter.py`、
> `app/models/pet.py`）。4 个内置预设；`PUT /pets/active` 的 petId 传预设 id 时先实例化再激活；
> 交接信由 LLM 生成、失败退模板，不阻断切换。


| 方法 | 路径 | 说明 |
|---|---|---|
| GET | `/handoffs` ★ | 历次交接信（切换桌宠时"朋友间的交接信"，只概括计划/趋势，不复述敏感细节） |
| GET | `/handoffs/{id}` | 单封详情 |## 3. 交接信 Handoffs ★


## 4. 对话 Conversations ★ — ✅ 已实现

> 文本对话 + 历史持久化走 REST；**实时语音**走 `/ai/realtime`（前端直连网关）。
> 已实现（`app/routers/conversations.py`、`app/services/conversation_store.py`、
> 桌宠回应走 LangGraph `app/graphs/companion.py`，LLM 失败有温和兜底）。

| 方法 | 路径 | 说明 |
|---|---|---|
| POST | `/conversations` ★ | 开启对话，`{petId, mode}`；mode ∈ `free_chat`(自由聊聊) / `brain_dump`(一股脑倒) / `hard_thing`(说件放不下的事) / `review_fragment`(回看片段, 带 fragmentId) |
| GET | `/conversations` ○ | 历史会话列表 |
| GET | `/conversations/{id}` ★ | 会话详情 + 消息 |
| POST | `/conversations/{id}/messages` ★ | 发消息 → 返回桌宠回应（内部走 LangGraph）。`?stream=true` 走 SSE |
| GET | `/conversations/{id}/messages` | 消息分页 |

## 5. 睡前思绪整理 Brain Dumps ★（核心闭环）— ✅ 已实现

| 方法 | 路径 | 说明 |
|---|---|---|
| POST | `/brain-dumps` ★ | 一次倾倒：`{text}` 或 `{audioRef}` 或 `{conversationId}`。**返回 `text/event-stream`**：边分类边推 `item.classified`（含 kind + 资源 id），末尾推 `receipt` + `done`。结果同时持久化 |
| GET | `/brain-dumps/{id}` ★ | 事后回取：回执 + 产出项引用（todos/summary/ideas/emotions/candidates 的 id）。`status: processing\|done` |

> 已实现（`app/routers/brain_dumps.py`、`app/services/dump_ingest.py`）。
> `status` 为真实语义（root 创建时 processing、收尾置 done，原地更新不走版本链）；
> `outputs` 按 kind 映射五类产出引用（片段→candidates）；GET 已带鉴权与用户隔离。
> 语音倾倒：前端可先用 `/ai/stt` 转文字再提交，或直接传 `audioRef` 由后端转写。
> 原始语音、重复语句在处理后删除（隐私红线，非接口，是后端规则）。

## 6. 分类产出：五个存储 — ✅ 已实现

睡前整理把内容分流到下面五类资源；也支持手动增改。
已实现（`app/routers/stores.py`，底层复用 memory_items + kind 专属字段 status/due_date）。

### 6.1 待办 Todos ★（= 信箱"今日待启"）
| 方法 | 路径 | 说明 |
|---|---|---|
| GET | `/todos` ★ | `?status=pending\|done&due=today`（`due=today` 即"今日待启"） |
| POST | `/todos` ○ | 手动新建 |
| GET | `/todos/{id}` | 详情 |
| PATCH | `/todos/{id}` ★ | 改内容/截止/状态（完成/取消，保留至完成或取消） |
| DELETE | `/todos/{id}` ○ | 删除 |

### 6.2 今日小结 Summaries ★（日卡）
| GET `/summaries` ★（`?date=`） · GET `/summaries/{id}` · PATCH `/summaries/{id}` ○ · DELETE ○ |

### 6.3 灵感 Ideas ★
| GET `/ideas` ★ · POST `/ideas` ○ · GET/PATCH/DELETE `/ideas/{id}` |

### 6.4 情绪 Emotions ★
| GET `/emotions` ★ · GET `/emotions/{id}` · DELETE `/emotions/{id}` |
> 只承接不强转任务；一般不编辑，可删除（隐私）。默认进"三日寄存"。

## 7. 片场 Theater ★

### 7.1 候选片段 Candidates ★
| 方法 | 路径 | 说明 |
|---|---|---|
| GET | `/candidates` ★ | 待确认候选（当晚静默入草稿箱，**次日提醒**） |
| GET | `/candidates/{id}` | 详情 |
| POST | `/candidates/{id}/confirm` ★ | 确认 → 转为正式 scene，响应返回新 scene（副作用动作，故用子资源而非 PATCH） |
| DELETE | `/candidates/{id}` ★ | 忽略/删除 |

### 7.2 场景 Scenes ★
| 方法 | 路径 | 说明 |
|---|---|---|
| GET | `/scenes` ★ | 我的场景 |
| POST | `/scenes` ★ | 主动创建：`{title, people, place, plot, intent}`（补充人物/地点/经过/想尝试的表达） |
| GET | `/scenes/{id}` ★ | 详情（含视觉小说节点/脚本） |
| PATCH | `/scenes/{id}` ○ | 补充细节 |
| DELETE | `/scenes/{id}` ○ | 删除 |
| GET | `/scenes/templates` ○ | 高频模板（没说出口的话/冲突后另一种回应/重要时刻预演） |

### 7.3 场景体验 Scene Play ★（视觉小说互动）
| 方法 | 路径 | 说明 |
|---|---|---|
| POST | `/scenes/{id}/plays` ★ | 开始一次体验 → 生成/返回首个剧情节点 |
| GET | `/scenes/{id}/plays/{playId}` ★ | 当前剧情节点（背景/立绘/对话/可选回应） |
| POST | `/scenes/{id}/plays/{playId}/choices` ★ | 提交一次回应选择 → 推进剧情（体验另一种表达） |
| POST | `/scenes/{id}/plays/{playId}/settlement` ★ | 结束 → 生成**结算卡** |

> 剧情生成与推进（`plays`、`choices`）同样可返回 `text/event-stream`，逐句吐视觉小说文本。

## 8. 信箱 Mailbox ★

信箱是四类内容的聚合视图，底层复用各资源。

| 方法 | 路径 | 说明 |
|---|---|---|
| GET | `/mailbox` ★ | 聚合概览：今日待启数、未读来信（`unread_letters_count`）、三日寄存概况（`ephemeral_count`）、珍藏入口（`treasures_count`） |

### 8.1 桌宠来信 Letters ★（主动陪伴产物）— ✅ 已实现
| 方法 | 路径 | 说明 |
|---|---|---|
| GET | `/letters` ★ | `?type=music\|movie\|book\|greeting\|relationship\|scene_invite&unread=true` |
| GET | `/letters/{id}` ★ | 详情 |
| PATCH | `/letters/{id}` ★ | 标记已读 `{read:true}` |
| DELETE | `/letters/{id}` ○ | 删除 |
> 生成是服务端主动行为（定时/触发），非公开写接口；落库创建走 `LetterStore.create`（内部入口）。每天≤1–2 封、无内容不发。
> ✅ 已实现（`app/routers/letters.py`、`app/services/letter_store.py`、`app/models/letter.py`）。

### 8.2 三日寄存 Ephemeral ★（72h TTL）— ✅ 已实现
| 方法 | 路径 | 说明 |
|---|---|---|
| GET | `/ephemeral` ★ | 临时寄存（情绪/生活片段/未确认候选），每项带 `expiresAt`（默认 72h） |
| POST | `/ephemeral/{id}/keep` ★ | 用户主动留下 → 转入长久珍藏（副作用动作） |
| DELETE | `/ephemeral/{id}` ○ | 立即删除 |
> 到期真删，不保留人物/地点/原话/具体事件（后端定时任务，隐私红线）。
> ✅ 已实现（`app/routers/ephemeral.py`、`app/services/ephemeral_store.py`；到期遗忘走 `inbox.expire_ephemeral`）。

### 8.3 长久珍藏 Treasures ★ — ✅ 已实现
| 方法 | 路径 | 说明 |
|---|---|---|
| GET | `/treasures` ★ | 用户主动留下的总结/灵感/重要记忆 |
| POST | `/treasures` ○ | 主动收藏（from summary/idea/memory） |
| GET/DELETE | `/treasures/{id}` | 详情/删除 |
> ✅ 已实现（`app/routers/treasures.py`、`app/services/treasure_store.py`、`app/models/treasure.py`）。珍藏 = 来源引用 + 内容快照。

## 9. 记忆与隐私 Memories ○ — ✅ 已实现

| 方法 | 路径 | 说明 |
|---|---|---|
| GET | `/memories` | 查看全部记忆（用户可查看/修改/删除全部记忆） |
| GET | `/memories/{id}` | 单条 |
| PATCH | `/memories/{id}` | 修改 |
| DELETE | `/memories/{id}` | 删除单条 |
| DELETE | `/memories` | 清空全部 |
> 交接信共享的正是这些"用户允许保留的记忆"。产品不做诊断、不把推测当事实。
> ✅ 已实现（`app/routers/memory.py`）。修改走 UPDATE 版本链、删除走 FORGET，均保留 history。
>
> 另有面向用户的审阅面 **`GET /memory-review`**（spec phase 6，`app/routers/memory_review.py`）：
> 只列 profile/state 层，输出 surface_text + provenance + 敏感度软标签（日常/个人/较私密/很私密），
> 不暴露轴名与任何诊断/人格标签，支持敏感度/kind 过滤。


---

## 11. 与 AI 网关的分工（已建）

| 场景 | 走哪条 |
|---|---|
| 文本对话（要持久化历史） | REST `POST /conversations/{id}/messages` |
| 实时语音陪伴 | 前端直连 `WS /ai/realtime` |
| 睡前语音倾倒转文字 | `WS /ai/stt/stream` 或 `POST /ai/stt` → 再 `POST /brain-dumps` |
| 服务端内部推理（分类/来信/剧情） | LangGraph 图内用 `app/llm.py` 直连阶跃 |

## 12. 设计决策记录

- ✅ **用户模型 = 多用户+账号**：全局 `Authorization`，资源按用户隔离（见 §A）。
- ✅ **AI 重活 = SSE 流式回执**：brain-dump 分类、场景生成/推进边处理边推事件（见 §5、§7.3）。
- 🔵 **状态流转风格（我的默认）**：副作用动作用子资源（`/confirm` `/keep` `/settlement`），
  纯字段更新用 `PATCH`。想统一成 `PATCH status` 可调。
- 🔵 **对话与倾倒边界（我的默认）**：睡前倾倒是独立 `POST /brain-dumps`，也接受
  `conversationId` 把一段对话喂进来；两者并存不互斥。
- ✅ **检索 = 纯本地无向量**（对齐 hermes-agent 架构）：已移除 RAG P2（DashScope embedding /
  qwen3-rerank / Zilliz）。召回靠 context_builder 的结构化分层 + 关键词/实体匹配，
  做梦聚类走纯 entity 交集——私密内容从此没有任何外发路径。
