# Design Document

## Overview

本设计实现 MindOff 的**双轴记忆系统**：工程轴（借鉴 Hermes 的 L1 常驻 / L2 检索 / L3 长期分层）负责「存哪、怎么检索、多少成本」；冰山轴（萨提亚压缩为 4 层）负责「这条记忆在心理的哪一层」。两轴通过**一次提取、双重打标**在同一条 `memory_item` 上交汇。

核心策略：**先打通单向主链路（倾倒 → 双轴提取 → 分层存储 → 信箱表层交还），再叠加下沉聚合、片场供给回写、信任门控、深度隐私**。每个能力以开关控制、可独立回滚，深层功能异常绝不影响倾倒/信箱主链路。

参考实现：`references/hermes-agent-memory-architecture.md`（分层记忆、字符上限、写入门控、后台自审 fork、上下文围栏）。冰山轴为本项目原创改造。

### 设计前提（greenfield）

- MindOff 为新建项目，尚无后端基线。本 spec 确立后端为记忆系统的承载方。
- 技术栈决策（见「关键决策」）：Python 3.11 + FastAPI + SQLAlchemy + SQLite（黑客松，后可换 Postgres）+ Alembic 迁移；LLM 经可配置 Provider 调用；episodic 语义召回黑客松期用轻量向量方案（sqlite 存 embedding + 余弦），后续可换专用向量库。
- 前端为现有 React 原型（`mindoff-proto/05-aligned.html` 的 4-Tab IA），通过 HTTP/WS 消费记忆接口。
- 桌宠形象由设计队友负责，记忆系统只提供「发声内容 + 主动提起时机」。

## Architecture

### 分层总览

```
                     冰山轴 (iceberg_layer)
                event → feeling → belief → yearning
工程轴            ┌──────────────────────────────────┐
 L1 常驻上下文    │  context_builder 注入 prompt       │  ← 字符预算 + 围栏
 L2 倾诉检索      │  session/dump 全量可检索 (FTS/向量) │  ← 零/低 LLM 成本
 L3 长期记忆库    │  memory_items + memory_history     │  ← 双轴打标 + 版本链
                 └──────────────────────────────────┘
```

### 主链路数据流（Phase 0–2，快赢）

```
睡前倾倒 (语音转录/打字)
   └─→ dump_ingest ──→ raw_ref 落库 (可阈后即焚)
         └─→ extractor.extract  (LLM)
               └─→ 事实列表 [{action_type, iceberg_layer, confidence, evidence, entities, emotion}]
                     └─→ memory_store.create (逐条, 同步写 history)
                           └─→ receipt.build ──→「妥了」回执 (计数 + 去向)

次日清晨
   └─→ inbox.build_today ──→ 读 event 层需行动记忆 ──→ 最小行动选项 / 待补区
```

### 演化链路（Phase 3–5，离线/低频）

```
consolidation job (每日复盘后 / 倾倒累积到阈值)
   ├─ descent.aggregate      多条 feeling/belief → 更深层假设 (derives, 低置信, 不确定措辞)
   ├─ forget_expired         过 expires_at → is_forgotten + history(FORGET)
   └─ trust.update           据互动/确认/否认演化关系亲密度

片场重演
   └─→ stage.supply(segment) ──→ event 上下文 + 相关角色小冰山 (belief/yearning)
         └─→ 视觉小说交互 ──→ settlement 结算卡
               └─→ writeback: 最小行动 → event 层 (可进信箱)
                              触碰的期待/渴望 → 角色小冰山

主动陪伴 (桌宠发声)
   └─→ proactive.pick ──→ 候选记忆 ──→ trust_gate: visibility_gate ≤ trust ? 发声 : 静默
         └─→ 角色化确认 ──→ confirm/deny → 回写 confidence
```

### Step 0 抽取共享上下文构建器

新增 `context_builder`，作为桌宠对话、倾倒、片场重演的唯一记忆上下文来源，支持 profile / query / full 三模式，所有检索源 try/except 兜底退化为空。

## Components and Interfaces

### memory_store（Phase 0）

```python
class MemoryStore:
    def create(self, item: MemoryItemIn) -> MemoryItem: ...        # 同步写 history(ADD)
    def get(self, id: int) -> MemoryItem | None: ...
    def update(self, id: int, patch: dict, *, actor: str) -> MemoryItem: ...  # 版本链 + history(UPDATE)
    def forget(self, id: int, reason: str) -> None: ...            # is_forgotten + history(FORGET)
    def list_by_layer(self, user_id: int, layer: str, *, latest=True) -> list[MemoryItem]: ...
    def list_by_action(self, user_id: int, action_type: str) -> list[MemoryItem]: ...
```

### extractor（Phase 1）

```python
@dataclass
class ExtractedFact:
    action_type: str        # 待办/今日小结/灵感/情绪/候选片段
    iceberg_layer: str      # event/feeling/belief  (yearning 不由单次提取产出)
    content: str
    surface_text: str
    confidence: float
    evidence: str
    entities: list[str]
    emotion: dict | None    # {label, intensity}

async def extract(dump_text: str, *, user_id: int) -> list[ExtractedFact]
```

- LLM 提示词要求：先分句/分点，再对每条同时判定 action_type 与 iceberg_layer；表层可执行→event，情绪→feeling，信念/期望→belief。
- 失败或空返回 `[]`，由 dump_ingest 走兜底回执，raw_ref 不丢。

### inbox（Phase 2）

```python
def build_today(user_id: int) -> InboxToday          # 仅 event 层需行动记忆 + 待补区
def build_letters(user_id: int) -> list[Letter]      # 桌宠来信, 每日 ≤1–2
```

### descent（Phase 3）

```python
async def aggregate(user_id: int) -> list[MemoryItem]
# 聚类同主题 feeling/belief 信号 → 超阈值则 LLM 生成更深层假设
# 产出: iceberg_layer 更深, confidence ≤ 来源均值, relation_type=derives, provenance=[源 id...]
# surface_text 强制不确定措辞
```

### stage（Phase 4）

```python
def supply(segment_id: int) -> StageScript           # event 上下文 + 相关角色小冰山
def settle(session_id: int, card: SettlementCard) -> None
# 最小行动 → memory_store.create(layer=event); 触碰的期待/渴望 → role_iceberg.writeback
```

### trust & proactive（Phase 5）

```python
class TrustState:  # 关系亲密度
    value: float                                     # 0..1
    def update(self, *, interactions, confirms, denies) -> None

def pick(user_id: int) -> MemoryItem | None
# 候选按 provenance 充分性排序; 过滤 visibility_gate > trust 的记忆; 尊重"关闭主动陪伴"
```

### context_builder（Step 0 / Phase 6）

```python
@dataclass
class MemoryContext:
    profile_text: str        # 稳定 belief/yearning + 近期 feeling
    recall_text: str         # query 语义召回 event/片段
    def to_prompt_block(self, *, max_chars: int = 1800) -> str: ...  # <memory-context> 围栏

async def build_context(user_id: int, query: str = "", *, mode: str = "full") -> MemoryContext
```

## Data Models

### MemoryItem（`memory_items`，int 主键）

- id(int pk), user_id(fk)
- **双轴**：`action_type`（待办/今日小结/灵感/情绪/候选片段）、`iceberg_layer`（event/feeling/belief/yearning）
- content(Text), surface_text(Text), confidence(Float)
- version(int=1), parent_id(fk self), root_id(fk self), is_latest(bool=true)
- is_forgotten(bool=false), forget_reason, expires_at
- relation_type(updates/extends/derives), relation_to_id(fk self)
- entities(JSON list), emotion(JSON {label,intensity})
- provenance(JSON list：来源倾倒/片段/结算卡/下沉来源 id)
- visibility_gate(Float：主动提起所需信任阈值，默认随层加深升高)
- privacy(local/cloud/burn_after_read)
- raw_ref(指向原始倾诉，可即焚), created_at, updated_at
- 索引：`(user_id, iceberg_layer, is_latest)`、`(user_id, action_type)`、`(root_id)`

### MemoryHistory（`memory_history`，int 主键）

- id(int pk), memory_id(fk), event(ADD/UPDATE/DELETE/FORGET/RECOVER), actor, old_content, new_content, meta(JSON), created_at

### RoleIceberg（`role_icebergs`，int 主键）

- id(int pk), user_id(fk), role_id(fk 角色库人物), layer(belief/yearning), content, confidence, provenance(JSON), updated_at
- 索引：`(user_id, role_id, layer)`

### TrustState（`trust_states`，int 主键）

- id(int pk), user_id(fk), value(Float 0..1), interactions(int), confirms(int), denies(int), updated_at

### 默认门控/隐私映射（随冰山层加深收紧）

| iceberg_layer | 默认 visibility_gate | 默认 privacy |
|---------------|----------------------|--------------|
| event         | 0.0                  | cloud        |
| feeling       | 0.3                  | local        |
| belief        | 0.6                  | local        |
| yearning      | 0.85                 | local        |

## Correctness Properties

### Property 1: 输入不丢失
任一倾倒即使提取失败，raw_ref 仍落库且返回兜底回执。
**Validates: Requirements 1.5**

### Property 2: 双轴完整
每条 memory_item 必然同时具备合法 action_type 与合法 iceberg_layer（枚举内）。
**Validates: Requirements 1.2, 2.3**

### Property 3: 历史完整
memory_item 任何写操作必伴随一条 memory_history。
**Validates: Requirements 2.4**

### Property 4: 版本链一致
UPDATE 后旧版本 is_latest=false，新版本 version=旧+1、parent_id 指向旧版本、root_id 不变。
**Validates: Requirements 2.5**

### Property 5: 信箱深度隔离
`inbox.build_today` 只返回 event 层记忆，绝不含 feeling/belief/yearning。
**Validates: Requirements 3.1**

### Property 6: 下沉不僭越
下沉产出记忆的 confidence ≤ 来源均值、层级更深、relation_type=derives，且 surface_text 为不确定措辞。
**Validates: Requirements 4.2, 4.3**

### Property 7: 信任门控生效
主动提起的记忆必满足 visibility_gate ≤ 当前 trust；关闭主动陪伴时无任何主动提起。
**Validates: Requirements 6.2, 6.5**

### Property 8: 深层不外泄
belief/yearning 记忆默认 privacy=local，不进入同步/外部 Provider，除非显式授权。
**Validates: Requirements 7.5**

### Property 9: 检索容错
context_builder 任一检索源异常时该段退化为空，不抛出、不阻断对话/倾倒/重演。
**Validates: Requirements 8.5**

### Property 10: 无诊断输出
面向用户的任何文本不含冰山层名、诊断结论或人格标签。
**Validates: Requirements 9.1**

## Error Handling

- 提取失败/超时 → 返回 `[]`，dump 走兜底回执，raw_ref 保留。
- 所有记忆检索包 try/except，失败退化为空段，不阻断主流程。
- 下沉/信任/主动陪伴均为离线或旁路任务，异常仅记日志，不影响倾倒/信箱。
- 迁移与 consolidation 幂等可重跑。

## Testing Strategy

- Phase 0：memory_store CRUD + history 写入 + 版本链单测。
- Phase 1：extractor 双轴打标断言（表层→event、情绪→feeling、信念→belief）；失败兜底不丢 raw_ref。
- Phase 2：inbox 深度隔离（只出 event）、待补区、72h 遗忘。
- Phase 3：下沉不僭越（置信/层级/措辞）、confirm/deny 回写。
- Phase 4：片场供给取到角色小冰山、结算回写路径。
- Phase 5：信任门控过滤、关闭主动陪伴后无主动发声。
- 贯穿：Property 1–10 各配至少一条断言用例。

## 关键决策

- **双轴单表**：action_type 与 iceberg_layer 同挂 memory_item，一次提取双重打标，避免双流程漂移。
- **冰山压 4 层**：完整 8 层对分类器不可靠且无必要；yearning 只由下沉得出，不由单次提取产出。
- **越深越谨慎**：深层记忆低置信、高门控、强隐私、不确定措辞——落地「不把推测包装成事实」。
- **角色化确认替代技术审批**：Hermes 的 write_approval 门 → 桌宠/片场软性求证，用户回应即审批。
- **主键沿用 int**、黑客松用 SQLite + 轻量向量，主链路与演化链路开关分离、可回滚。
