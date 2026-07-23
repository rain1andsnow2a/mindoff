# Requirements Document

## Introduction

为 MindOff（以桌宠为入口的情感陪伴 Agent）设计**双轴记忆系统**：

- **功能轴**（决定怎么存、怎么还、怎么保鲜）：借鉴 mem0/Hermes 的分层与检索，用 `layer`（episodic/profile/state）+ `kind`（待办/小结/灵感/情绪/片段）组织存取。
- **深度轴**（决定怎么谨慎处理、怎么克制呈现）：用有序的 `depth`（surface/personal/vulnerable/core）承载记忆的敏感度。深度轴的灵感来自萨提亚冰山，但**只提炼其"越深越谨慎"的精神，不套用临床层级术语，也不对用户外露**。

配套一个**离线「睡前做梦」Agent**：每日凌晨定时触发（默认 00:00），做深加工——下沉出更深 depth 的假设、去重消解冲突、遗忘保鲜、生成主动陪伴候选。再配一个面向用户的**记忆审阅控制面**（我的·记忆：查看/纠正/删除 + 来源可见）。

本次以黑客松可交付为目标，采用**分阶段、可回滚**策略：先打通「睡前倾倒 → 双轴提取 → 分层存储 → 信箱表层交还」主链路（快赢），再叠加做梦 Agent、片场供给回写、信任门控、深度隐私、审阅面。

关键约束（已确认）：
- **冰山仅作 depth 轴的内部灵感，不作记忆的强制分层、不用于角色、不对用户输出诊断/人格分析**；系统「从不承诺治疗、不把推测包装成事实」。
- 睡前倾倒**一次提取、同时打三种标**（layer + kind + depth），不建重复流程。
- 越深的 depth，置信度越低（越是推测）、隐私要求越高、主动提起门槛越高。
- 深加工由离线做梦 Agent 完成，**每日凌晨定时触发**（默认 00:00），不阻塞倾倒回执。

## Glossary

- **功能轴（Functional Axis）**：`layer`（episodic 具体事件片段/倾诉/片段、profile 稳定画像、state 近期动态）+ `kind`（待办/小结/灵感/情绪/片段），驱动存取、检索、信箱交还。
- **深度轴（Depth Axis）**：`depth` 有序敏感度——`surface`（可公开的事务）、`personal`（个人偏好/日常情绪）、`vulnerable`（脆弱/私密）、`core`（核心渴望/自我）。驱动门控、隐私、谨慎度、呈现克制。
- **双轴打标（Dual-axis Tagging）**：一条记忆同时带 layer、kind、depth。
- **睡前做梦 Agent（Dreaming Agent）**：离线有界 agent，每日凌晨定时触发，负责下沉聚合、去重消解、遗忘保鲜、主动候选生成。
- **下沉（Descent）**：由多条相关记忆聚合出更深 depth 假设的过程；越深越是推测，必带 confidence 与 provenance。
- **信任门控（Trust Gate）**：主动提起某条记忆所需的最低「关系亲密度」阈值；由 depth 决定默认门槛。
- **回执（Receipt）**：倾倒结束后返回的「妥了」确认，对应文档 §4.2。
- **角色化确认（In-character Confirmation）**：深层假设不弹技术审批框，而由桌宠/片场以陪伴口吻软性求证，用户回应即确认。
- **记忆审阅控制面（Memory Review Surface）**：我的·记忆页，用户可查看/纠正/删除记忆并看到来源。

## Requirements

### 需求 1：睡前倾倒采集与双轴提取

**用户故事**：作为用户，我希望睡前一股脑说完的话被理解并归位，而不是只被存成一堆原始文本。

#### 验收标准

1. WHEN 用户完成一次睡前倾倒（语音转录或打字）THEN 系统 SHALL 调用提取流程，输出结构化事实列表。
2. THE 每条提取结果 SHALL 同时携带 `layer`（episodic/profile/state）、`kind`（待办/小结/灵感/情绪/片段）、`depth`（surface/personal/vulnerable/core）、`confidence`、`evidence`、关联 `entities`、`emotion`。
3. THE 提取器 SHALL 将可执行事务判为 surface，将个人偏好/日常情绪判为 personal，将私密/脆弱内容判为 vulnerable；`core` 深度 SHALL NOT 由单次提取直接产出，仅由做梦 Agent 下沉得出（见需求 4）。
4. WHEN 一次倾倒同时包含多种内容 THEN 系统 SHALL 拆分为多条记忆，各自独立打标。
5. IF 提取失败或返回空 THEN 系统 SHALL 保留原始倾诉引用（可阈后即焚）、返回「已收到」的兜底回执，不得丢失用户输入。
6. WHEN 倾倒完成 THEN 系统 SHALL 生成回执数据（各 kind 计数与去向）供「妥了」界面展示。做梦 Agent 由每日定时任务独立触发（见需求 4），不在此步派发。

### 需求 2：分层记忆存储与版本链

**用户故事**：作为系统，我需要一套支持双轴、版本、变更历史的存储，作为长期演化的底座。

#### 验收标准

1. THE 系统 SHALL 提供 `memory_items` 存储，字段至少含：id、user_id、`layer`、`kind`、`depth`、content、surface_text、confidence、version、parent_id、root_id、is_latest、is_forgotten、entities、emotion、provenance、visibility_gate、privacy、raw_ref、created_at、expires_at。
2. THE 系统 SHALL 提供 `memory_history`，记录每次写操作的 event（ADD/UPDATE/DELETE/FORGET/RECOVER）、actor、前后内容、时间。
3. THE `layer` SHALL 限定为 episodic/profile/state 之一；`depth` SHALL 限定为 surface/personal/vulnerable/core 之一。
4. WHEN 创建或变更任一 memory_item THEN 系统 SHALL 同步写入一条 memory_history。
5. WHEN 一条记忆被更深假设替代或修正（UPDATE）THEN 系统 SHALL 创建新版本（version+1、parent_id 指向旧版本、root_id 不变），并将旧版本 is_latest 置为 false。
6. THE 系统 SHALL 提供按 user+layer、user+kind、user+depth、root_id 的查询能力。

### 需求 3：信箱表层交还

**用户故事**：作为用户，我希望昨晚说的事第二天早上被恰当地交还，而不是深夜就被追问，也不是石沉大海。

#### 验收标准

1. WHEN 用户次日打开信箱「今日待启」THEN 系统 SHALL 只交还 `depth=surface` 且需行动的记忆（kind=待办/带时间提醒），不主动展示 personal/vulnerable/core 深度内容。
2. THE 每条交还项 SHALL 附最小行动选项（加入日历/加入待办/复制到项目/暂缓一天/补全时间/确认已处理）。
3. WHEN 记忆缺必要信息（时间/地址）THEN 系统 SHALL 归入「待补区」并提供补全入口，而非丢弃或催促。
4. THE 信箱「三日寄存」内容 SHALL 默认 72 小时后遗忘（is_forgotten）并写 history(FORGET)。
5. THE 每日交还的桌宠来信 SHALL 限制在 1–2 封以内（对应文档 §4.3）。

### 需求 4：睡前做梦 Agent（离线深加工）

**用户故事**：作为系统，我需要在用户睡下后，谨慎地整理白天的记忆——提炼更深的期待、消解重复冲突、遗忘过期、准备明天该轻声提起的话，且永不把推测当事实。

#### 验收标准

1. WHEN 每日凌晨定时到达（默认 00:00）THEN 系统 SHALL 触发做梦 Agent 对所有活跃用户的当日记忆进行深加工，且该处理 SHALL NOT 阻塞倾倒/信箱主链路。
2. THE 做梦 Agent SHALL 为**有界 agent**：按固定阶段（召回相关记忆 → 聚类 → 生成/合并/遗忘 → 生成主动候选）运行，工具白名单仅限记忆读写，禁止开放式自主循环。
3. WHEN 同一主题的相关记忆重复出现且超阈值 THEN 系统 SHALL 下沉生成更深 depth 的假设记忆，满足：depth 深于来源、confidence ≤ 来源均值、relation_type=derives、provenance 记录所有来源、surface_text 用「可能/好像/是不是」等不确定措辞。
4. THE 做梦 Agent SHALL 对 profile/state 层做近义去重与冲突消解（高置信覆盖低置信，保留版本链），并对过 expires_at 的记忆写 FORGET。
5. WHEN 一条下沉假设被用户通过角色化确认认可 THEN 系统 SHALL 提升其 confidence 并标记 confirmed；WHEN 被否认 THEN 系统 SHALL 降权或遗忘并写 history。
6. IF 做梦 Agent 任一阶段失败 THEN 系统 SHALL 记录日志并跳过该阶段，SHALL NOT 影响已完成的倾倒/信箱主链路。

### 需求 5：片场重演的记忆供给与结算回写

**用户故事**：作为用户，我希望片场重演贴近真实的那个人和那件放不下的事，重演后能带回一件东西。

#### 验收标准

1. WHEN 用户从候选片段进入片场 THEN 系统 SHALL 供给该片段关联的 episodic 上下文 + 相关角色档案 + 相关较深 depth（vulnerable/core）记忆，作为剧本动机来源。
2. THE 角色库人物 SHALL 先以**普通角色档案**（姓名、关系、若干笔记）占位存储；本次 SHALL NOT 为角色引入冰山/深度分层（角色形象与深度建模由设计队友后续负责）。
3. WHEN 一次片场重演结束并生成结算卡 THEN 系统 SHALL 允许回写：最小行动 → 新建 surface 记忆（可进信箱）；重演中触碰的期待/领悟 → 关联到相关记忆或角色档案笔记。
4. WHERE 用户选择「珍藏这张卡」THEN 系统 SHALL 长久保存；WHERE 选择「结束后删除」THEN 系统 SHALL 会话结束后遗忘。
5. THE 片场场景 SHALL 采用视觉小说形式（氛围背景 + 角色立绘 + 文字对话 + 选择回应），记忆系统只提供内容，不涉及 3D 渲染。

### 需求 6：主动陪伴与信任门控深度访问

**用户故事**：作为用户，我希望桌宠只在合适的时机、以合适的深度提起我心里的事，而不是冒失戳破或频繁打扰。

#### 验收标准

1. THE 系统 SHALL 维护「关系亲密度」信任状态（随互动时长、确认次数、否认次数演化）。
2. WHEN 桌宠准备主动提起某条记忆 THEN 系统 SHALL 校验该记忆 visibility_gate ≤ 当前信任值，否则不提起。
3. THE depth 越深，其默认 visibility_gate SHALL 越高（surface 最低，core 最高）。
4. THE 主动陪伴 SHALL 遵循文档 §4.6 三条：有依据（附 provenance）、低频可关、不用红点。
5. WHEN 用户在设置中关闭主动陪伴 THEN 系统 SHALL 停止一切主动提起，仅保留被动响应。

### 需求 7：隐私与深度分级

**用户故事**：作为用户，我说的越深的心里话，越希望它安全，甚至阅后即焚。

#### 验收标准

1. THE 每条记忆 SHALL 带 privacy 等级（本机/可上云/阈后即焚），默认随 depth 加深而收紧。
2. WHERE 记忆标记为「本机识别」THEN 敏感内容 SHALL NOT 离开设备。
3. WHERE 记忆标记为「阈后即焚」THEN 系统 SHALL 在其被读取/交还后按策略遗忘。
4. WHEN 用户关闭「保留原始倾诉」THEN 系统 SHALL 仅保留整理后的 surface_text，raw_ref 即焚。
5. THE vulnerable/core 深度记忆 SHALL 默认不进入任何跨设备同步或外部 Provider，除非用户显式授权。

### 需求 8：上下文注入与预算

**用户故事**：作为系统，我需要在不同场景按合适的深度与预算组装记忆上下文注入对话。

#### 验收标准

1. THE 系统 SHALL 提供统一上下文构建器，供桌宠对话、睡前倾倒、片场重演复用。
2. THE 构建器 SHALL 支持三模式：`profile`（稳定 profile + 近期 state）、`query`（按当前输入语义召回 episodic）、`full`（综合）。
3. WHEN 组装上下文 THEN 系统 SHALL 对各 layer 分别设条数/字符预算并去重，避免注入膨胀。
4. THE 注入内容 SHALL 用围栏标签（如 `<memory-context>`）包裹，并在流式输出中剔除，防止污染 UI。
5. IF 任一检索源异常 THEN 该段 SHALL 退化为空，绝不阻断对话/倾倒/重演。

### 需求 9：记忆审阅控制面

**用户故事**：作为用户，我想能看到 MindOff 记住了我什么、从哪来的、并且能随时纠正或删除。

#### 验收标准

1. THE 系统 SHALL 提供记忆审阅接口（我的·记忆），列出用户 profile/state 层记忆的 surface_text 与来源（provenance）。
2. WHEN 用户编辑一条记忆 THEN 系统 SHALL 以 UPDATE 落库（保留版本链与 history），后续检索 SHALL 使用编辑后的最新版本。
3. WHEN 用户删除一条记忆 THEN 系统 SHALL 标记 is_forgotten 并写 history(DELETE)，后续检索 SHALL NOT 再召回。
4. THE 审阅面 SHALL 用简单的敏感度指示（如「较私密」）呈现 depth，SHALL NOT 显示冰山层名或任何诊断/人格标签。
5. THE 审阅面 SHALL 允许用户按 depth 或 kind 过滤查看。

### 需求 10：非目标与伦理边界

**用户故事**：作为维护者，我需要明确本次不做的范围与不可逾越的伦理红线。

#### 验收标准

1. THE 系统 SHALL NOT 向用户输出任何心理诊断、人格标签、冰山分析报告；冰山仅为 depth 轴的内部灵感。
2. THE 本次 SHALL NOT 包含跨设备同步、外部记忆 Provider 接入、知识图谱、角色的冰山/深度建模。
3. THE 每个 Phase SHALL 保留可回滚开关，深加工/深层功能异常时可关闭而不影响倾倒/信箱主链路。
4. THE 桌宠形象与切换逻辑 SHALL 由设计队友负责，本 spec 仅将桌宠作为记忆的展示/发声出口占位。
