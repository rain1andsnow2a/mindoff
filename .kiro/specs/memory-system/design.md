# Design Document

## Overview

本设计实现 MindOff 的**双轴记忆系统**：

- **功能轴**（怎么存/怎么还/怎么保鲜）：`layer`（episodic/profile/state）+ `kind`（待办/小结/灵感/情绪/片段），驱动存取、检索、信箱交还、整合。
- **深度轴**（怎么谨慎/怎么克制）：有序 `depth`（surface/personal/vulnerable/core），驱动 visibility_gate、privacy、谨慎度与呈现克制。深度轴提炼自萨提亚冰山「越深越谨慎」的精神，但**不套临床层级、不用于角色、不对用户外露**。

深加工交给一个离线**睡前做梦 Agent**（有界 agent），**每日凌晨定时触发**（默认 00:00），完成下沉聚合、去重消解、遗忘保鲜、主动候选生成。用户侧提供**记忆审阅控制面**（我的·记忆）实现可查看/纠正/删除与来源可见。

核心策略：**先打通单向主链路（倾倒 → 双轴提取 → 分层存储 → 信箱表层交还），再叠加做梦 Agent、片场供给回写、信任门控、深度隐私、审阅面**。每能力以开关控制、可独立回滚，深加工异常绝不影响倾倒/信箱主链路。

参考实现：`references/hermes-agent-memory-architecture.md`（分层记忆、字符上限、后台自审 fork、上下文围栏、写入门控）；mem0 的 ADD/UPDATE/DELETE/NOOP 决策与 history 表。深度轴与做梦叙事为本项目原创改造。

### 设计前提（greenfield）

- MindOff 为新建项目，尚无后端基线；本 spec 确立后端为记忆系统承载方。
- 技术栈（见「关键决策」）：Python 3.11 + FastAPI + SQLAlchemy + SQLite（黑客松，后可换 Postgres）+ Alembic；LLM 经可配置 Provider 调用；episodic 语义召回黑客松期用轻量向量方案（SQLite 存 embedding + 余弦）。
- 前端为现有 React 原型（`mindoff-proto/05-aligned.html` 4-Tab IA），经 HTTP/WS 消费记忆接口。
- 桌宠形象由设计队友负责，记忆系统只提供「发声内容 + 主动提起时机」。

## Architecture

### 分层总览

```
功能轴                                          深度轴 (depth)
 layer:  episodic / profile / state       surface → personal → vulnerable → core
 kind:   待办/小结/灵感/情绪/片段          (门控↑  隐私↑  置信谨慎↑  呈现克制↑)
        ┌───────────────── memory_items（双轴打标 + 版本链）─────────────────┐
        │ 实时提取(快, 只产 surface/personal/vulnerable)  离线做梦(下沉出 core) │
        └────────────────────────────────────────────────────────────────────┘
```

### 主链路数据流（Phase 0–2，快赢）

```
睡前倾倒 (语音转录/打字)
   └─→ dump_ingest ──→ raw_ref 落库 (可阈后即焚)
         └─→ extractor.extract  (LLM, 快)
               └─→ 事实列表 [{layer, kind, depth, confidence, evidence, entities, emotion}]
                     └─→ memory_store.create (逐条, 同步写 history)
                           └─→ receipt.build ──→「妥了」回执 (kind 计数 + 去向)

每日凌晨 00:00（定时调度）
   └─→ dreaming_agent.run(user)   ← 独立于倾倒，不阻塞主链路

次日清晨
   └─→ inbox.build_today ──→ 读 depth=surface 且需行动记忆 ──→ 最小行动选项 / 待补区
```

### 睡前做梦 Agent（Phase 3，每日定时）

```
dreaming_agent.run(user)          # 有界 agent: 固定阶段, 工具白名单=记忆读写
   ├─ recall     召回近期 + 相关历史记忆
   ├─ cluster    按主题聚类相关 personal/vulnerable 信号
   ├─ descend    超阈值 → LLM 生成更深 depth 假设 (derives, 低置信, 不确定措辞)
   ├─ reconcile  profile/state 去重 + 冲突消解 (高置信覆盖低置信, 保版本链)
   ├─ forget     过 expires_at → is_forgotten + history(FORGET)
   └─ prepare    生成主动陪伴候选 (待信任门控筛选)
   ※ 任一阶段失败仅记日志并跳过, 不影响主链路
```

### 演化交互链路（Phase 4–6）

```
片场重演  stage.supply(segment) → episodic 上下文 + 角色档案 + 相关 vulnerable/core 记忆
          → 视觉小说交互 → settlement → writeback(最小行动→surface / 领悟→相关记忆或角色档案)

主动陪伴  proactive.pick → 候选 → trust_gate: visibility_gate ≤ trust ? 发声 : 静默
          → 角色化确认 → confirm/deny → 回写 confidence

审阅面    memory_review.list/edit/delete  (我的·记忆, provenance 可见, 敏感度软提示)
```

## Components and Interfaces

### memory_store（Phase 0）

所有记忆读写的唯一入口，封装版本链与历史落库：

- **新建**：写入一条 memory_item，同步记一条 ADD 历史。
- **读取**：按 id 取单条。
- **更新**：走版本链——旧版本置为非最新，生成 version+1 的新版本（parent_id 指向旧版本、root_id 不变），并记 UPDATE 历史。
- **遗忘**：置 is_forgotten 并记 FORGET 历史；用户删除复用同一路径，记 DELETE。
- **查询**：支持按 layer、kind、depth 及 root_id 检索，默认只返回最新版本。

### extractor（Phase 1）

输入一次倾倒全文，输出一组结构化事实，每条携带：

- **三轴标签**：layer（episodic/profile/state）、kind（待办/小结/灵感/情绪/片段）、depth（surface/personal/vulnerable，**core 不由单次提取产出**）。
- **content**（保留原意事实）与 **surface_text**（温和口吻的复述文本）。
- **confidence**、**evidence**（原文片段）、**entities**（涉及的人/物/项目）、**emotion**（标签 + 强度，可空）。

失败或空结果时返回空列表，由 dump_ingest 走兜底回执、保留 raw_ref 不丢。

#### 分类提示词草稿（task 6）

一次调用完成「分点 + 三轴打标」。三轴判定边界先钉死在提示词里，实现时用下方少样例校准。

**三轴判定边界：**

- `layer`（这条信息活多久）
  - `episodic`：具体某一次的事件/对话/感受片段，带时间地点人物（「今天和老陈吵架了」）。
  - `state`：近期、会变、进行中的状态或目标（「这周压力很大」「在准备晋升答辩」）。
  - `profile`：稳定、跨时间成立的画像——偏好、关系、长期特质（「我是程序员」「怕黑」「和妈妈关系紧张」）。
- `kind`（这条信息要怎么被交还）：`待办` / `小结` / `灵感` / `情绪` / `片段`（=倾倒五类）。
- `depth`（这条信息多敏感）
  - `surface`：可公开的事务，说出来无负担（待办、日程、事实）。
  - `personal`：个人偏好、日常情绪，不介意被温和提起。
  - `vulnerable`：私密/脆弱、说出来需要勇气（羞耻、恐惧、创伤、亲密关系裂痕）。
  - `core`：**提取器不产出**；核心渴望/自我认同只由做梦 Agent 下沉得出，此处一律留空判到 vulnerable 以内。

**提示词模板：**

```text
[System]
你是 MindOff 的记忆整理助手。用户睡前一股脑倾诉，你要把它拆成一条条独立记忆并打三种标。
规则：
1) 先按语义分点，一件事/一种情绪/一个待办各成一条，不要合并。
2) 每条同时判 layer(episodic|state|profile)、kind(待办|小结|灵感|情绪|片段)、depth(surface|personal|vulnerable)。
3) depth 绝不输出 core——核心渴望/自我认同不在本步产生。
4) confidence 是"这条是否真实存在于原文"的把握(0-1)，不是重要性；推断成分越多越低。
5) surface_text 用第一人称、温和口吻改写，供日后向用户复述；content 保留原意事实。
6) 只输出 JSON 数组，无多余文字。字段: layer, kind, depth, content, surface_text,
   confidence, evidence(原文片段), entities(涉及的人/物/项目), emotion({label,intensity}|null)。

[User]
原始倾诉：
{dump_text}
```

**少样例（校准边界）：**

```json
[
  {"input": "明天下午三点要交季度报告，还没写完，好烦",
   "output": [
     {"layer":"episodic","kind":"待办","depth":"surface","content":"明天15:00前提交季度报告",
      "surface_text":"你明天下午三点要交季度报告","confidence":0.98,"evidence":"明天下午三点要交季度报告",
      "entities":["季度报告"],"emotion":{"label":"焦虑","intensity":0.6}}]},
  {"input": "其实我一直觉得自己不配现在这个职位，怕被人发现我是靠运气",
   "output": [
     {"layer":"profile","kind":"情绪","depth":"vulnerable","content":"用户存在冒充者综合征式的自我怀疑",
      "surface_text":"你有时会担心自己是不是不够格","confidence":0.85,
      "evidence":"觉得自己不配现在这个职位","entities":[],"emotion":{"label":"自我怀疑","intensity":0.8}}]},
  {"input": "突然想到可以做个睡前语音日记的小功能",
   "output": [
     {"layer":"state","kind":"灵感","depth":"personal","content":"想法：睡前语音日记功能",
      "surface_text":"你冒出一个点子——睡前语音日记","confidence":0.9,
      "evidence":"做个睡前语音日记的小功能","entities":["语音日记"],"emotion":null}]}
]
```

- 实现时把三轴枚举与少样例作为常量固定；解析失败或字段越界（如出现 core）时该条丢弃并记日志，不阻断其余条目。

### dreaming_agent（Phase 3）

离线有界 agent，每日凌晨定时触发（默认 00:00，可配置），按固定阶段 recall→cluster→descend→reconcile→forget→prepare 运行，工具白名单仅限记忆读写，受 `dreaming_enabled` 开关控制。另提供 debug 手动触发端点供演示。

- **下沉产出约束**：depth 比来源更深、confidence 不超过来源均值、relation_type=derives、provenance 记录全部来源 id、措辞不确定。
- **确认回写**：用户经角色化确认认可某条下沉假设时提升其 confidence 并标记 confirmed；否认时降权或遗忘。两种都记历史。
- 每阶段独立容错，任一阶段失败仅记日志并跳过，不影响主链路。

### inbox（Phase 2）

构建次日交还内容：只取 depth=surface 且需行动的记忆，附最小行动选项，缺必要信息的归入待补区。另构建桌宠来信，每日限 1–2 封。

### stage（Phase 4）

- **供给**：给定候选片段，组装其关联的 episodic 上下文、相关角色档案（普通笔记）、相关深层（vulnerable/core）记忆，作为剧本动机来源。
- **结算回写**：最小行动生成新的 surface 记忆（可进信箱）；重演中触碰的领悟关联到相关记忆或角色档案笔记；支持珍藏（长久保存）与即焚（会话结束遗忘）两种分支。

### trust & proactive（Phase 5）

- **信任状态**：维护关系亲密度（0..1），随互动时长、确认次数、否认次数演化。
- **主动候选**：按 provenance 充分性排序，过滤 visibility_gate 高于当前信任值的记忆，并尊重「关闭主动陪伴」设置。

### context_builder（Phase 6）

统一上下文构建器，供桌宠对话、睡前倾倒、片场重演复用。支持三模式：

- **profile**：稳定画像 + 近期动态。
- **query**：按当前输入语义召回 episodic。
- **full**：综合以上。

各 layer 分设条数/字符预算并去重，输出用 `<memory-context>` 围栏包裹（流式输出中剔除）；任一检索源异常时该段退化为空，不阻断主流程。

### memory_review（Phase 6）

我的·记忆控制面：

- **列出**用户 profile/state 记忆，带来源（provenance）与敏感度软标签（不含冰山层名/诊断），支持按 depth、kind 过滤。
- **编辑**走 UPDATE 版本链，后续检索使用编辑后的最新版本。
- **删除**置 is_forgotten 并记 DELETE 历史，后续不再召回。

## Data Models

### MemoryItem（`memory_items`，int 主键）

- id(int pk), user_id(fk)
- **功能轴**：`layer`(episodic/profile/state)、`kind`(待办/小结/灵感/情绪/片段)
- **深度轴**：`depth`(surface/personal/vulnerable/core)
- content(Text), surface_text(Text), confidence(Float)
- version(int=1), parent_id(fk self), root_id(fk self), is_latest(bool=true)
- is_forgotten(bool=false), forget_reason, expires_at
- relation_type(updates/extends/derives), relation_to_id(fk self)
- entities(JSON list), emotion(JSON {label,intensity})
- provenance(JSON list：来源倾倒/片段/结算卡/下沉来源 id)
- visibility_gate(Float：主动提起所需信任阈值，默认由 depth 决定)
- privacy(local/cloud/burn_after_read)
- raw_ref(指向原始倾诉，可即焚), created_at, updated_at
- 索引：`(user_id, layer, is_latest)`、`(user_id, kind)`、`(user_id, depth)`、`(root_id)`

### MemoryHistory（`memory_history`，int 主键）

- id(int pk), memory_id(fk), event(ADD/UPDATE/DELETE/FORGET/RECOVER), actor, old_content, new_content, meta(JSON), created_at

### RoleProfile（`role_profiles`，int 主键）—— 角色档案占位

- id(int pk), user_id(fk), name, relation, notes(Text)
- 本次**不含冰山/深度分层**；角色深度建模由设计队友后续立项。

### TrustState（`trust_states`，int 主键）

- id(int pk), user_id(fk), value(Float 0..1), interactions(int), confirms(int), denies(int), updated_at

### 默认门控/隐私映射（随 depth 加深收紧）

| depth      | 默认 visibility_gate | 默认 privacy | 单次提取可产出 |
|------------|----------------------|--------------|----------------|
| surface    | 0.0                  | cloud        | ✅             |
| personal   | 0.3                  | local        | ✅             |
| vulnerable | 0.6                  | local        | ✅             |
| core       | 0.85                 | local        | ❌（仅做梦下沉）|

## Correctness Properties

### Property 1: 输入不丢失
任一倾倒即使提取失败，raw_ref 仍落库且返回兜底回执。
**Validates: Requirements 1.5**

### Property 2: 双轴完整
每条 memory_item 必然具备合法 layer、kind、depth（均在枚举内）。
**Validates: Requirements 1.2, 2.3**

### Property 3: 深度产出约束
单次提取产出的记忆 depth ∈ {surface, personal, vulnerable}；core 仅出现在 relation_type=derives 的做梦产物中。
**Validates: Requirements 1.3, 4.3**

### Property 4: 历史完整
memory_item 任何写操作必伴随一条 memory_history。
**Validates: Requirements 2.4, 9.2, 9.3**

### Property 5: 版本链一致
UPDATE 后旧版本 is_latest=false，新版本 version=旧+1、parent_id 指向旧版本、root_id 不变。
**Validates: Requirements 2.5, 9.2**

### Property 6: 信箱深度隔离
`inbox.build_today` 只返回 depth=surface 记忆，绝不含 personal/vulnerable/core。
**Validates: Requirements 3.1**

### Property 7: 做梦不阻塞、不僭越
做梦 Agent 由每日定时任务独立触发，不依赖倾倒回执；下沉产物 confidence ≤ 来源均值、depth 更深、relation_type=derives、措辞不确定；任一阶段失败不影响主链路。
**Validates: Requirements 4.1, 4.3, 4.6**

### Property 8: 信任门控生效
主动提起的记忆必满足 visibility_gate ≤ 当前 trust；关闭主动陪伴时无任何主动提起。
**Validates: Requirements 6.2, 6.5**

### Property 9: 深层不外泄
vulnerable/core 记忆默认 privacy=local，不进入同步/外部 Provider，除非显式授权。
**Validates: Requirements 7.5**

### Property 10: 审阅可控
用户编辑经 UPDATE 生效、删除后不再被召回；审阅面不显示冰山层名/诊断/人格标签。
**Validates: Requirements 9.2, 9.3, 9.4, 10.1**

### Property 11: 检索容错
context_builder 任一检索源异常时该段退化为空，不抛出、不阻断对话/倾倒/重演。
**Validates: Requirements 8.5**

## Error Handling

- 提取失败/超时 → 返回 `[]`，dump 走兜底回执，raw_ref 保留。
- 做梦 Agent 每阶段 try/except 隔离，失败记日志并跳过，不回滚已完成主链路。
- 所有记忆检索包 try/except，失败退化为空段，不阻断主流程。
- 去重/遗忘/迁移幂等可重跑。

## Testing Strategy

- Phase 0：memory_store CRUD + history + 版本链（Property 4、5）。
- Phase 1：extractor 三标断言（layer/kind/depth 归类）、core 不由单次产出（Property 2、3）、失败兜底不丢 raw_ref（Property 1）。
- Phase 2：inbox 深度隔离（只出 surface，Property 6）、待补区、72h 遗忘。
- Phase 3：做梦异步不阻塞回执、下沉不僭越（Property 7）、confirm/deny 回写。
- Phase 4：片场供给取到角色档案 + 深层记忆、结算回写路径、珍藏/即焚。
- Phase 5：信任门控过滤、关闭后无主动发声（Property 8）。
- Phase 6：深度隐私（Property 9）、审阅编辑/删除生效与无诊断呈现（Property 10）、上下文容错（Property 11）。

## 关键决策

- **双轴 = 功能层(layer+kind) × 深度(depth)**；一次提取同时三标，避免多流程漂移。
- **冰山降级为 depth 轴的内部灵感**：只提炼「越深越谨慎」，不套临床术语、不外露、不用于角色。
- **角色先用普通档案占位**，不引入冰山/深度分层，等设计队友立项。
- **越深越谨慎**：深层低置信、高门控、强隐私、不确定措辞、单次提取不产 core——落地「不把推测包装成事实」。
- **做梦为有界 agent、每日凌晨定时触发**：固定阶段 + 记忆读写白名单，可控可测，不做开放式自主循环；攒一天记忆再聚类，跨主题关联更完整；异常隔离不伤主链路。
- **角色化确认替代技术审批**；主键沿用 int；黑客松用 SQLite + 轻量向量；主链路与深加工开关分离、可回滚。
