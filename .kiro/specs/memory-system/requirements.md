# Requirements Document

## Introduction

为 MindOff（以桌宠为入口的情感陪伴 Agent）设计**双轴记忆系统**：在 Hermes Agent 的「工程分层」记忆之上，叠加一条正交的「心理深度轴」——萨提亚冰山模型。每条记忆同时携带**功能属性**（该怎么还给用户）与**冰山层级**（它藏在心理的哪一层），使系统既能可靠地在信箱次日交还待办，又能在长期陪伴中缓慢、克制地理解用户的期待与渴望，并驱动片场重演。

本次以黑客松可交付为目标，采用**分阶段、可回滚**策略：先打通「睡前倾倒 → 双轴提取 → 分层存储 → 信箱交还」主链路（快赢），再逐步补齐「冰山下沉聚合、片场供给与回写、信任门控主动陪伴、深度分级隐私」。

关键约束（已与用户确认方向）：
- **冰山模型仅作内部记忆组织 schema，绝不对用户输出诊断/人格分析**，对外始终是陪伴口吻；系统「从不承诺治疗、不把推测包装成事实」。
- 完整萨提亚 8 层**压缩为 4 个可操作带**，降低分类器负担与不可靠性。
- 睡前倾倒的 5 类分类**一次提取、双重打标**（action_type + iceberg_layer），不重复建流程。
- 越深的冰山层，置信度越低（越是推测）、隐私要求越高、主动提起的门槛越高。

## Glossary

- **工程轴（Engineering Axis）**：借鉴 Hermes 的检索/成本分层——L1 常驻上下文（注入 prompt、字符受限）、L2 倾诉检索（全量可检索日志）、L3 结构化长期记忆库。
- **冰山轴（Iceberg Axis）**：萨提亚冰山压缩后的 4 层心理深度——`event`（事件·行为）、`feeling`（感受·情绪）、`belief`（观点·期待）、`yearning`（渴望·自我）。
- **双轴打标（Dual-axis Tagging）**：一条记忆同时带 `action_type`（待办/小结/灵感/情绪/片段）与 `iceberg_layer`。
- **下沉（Descent）**：由多条表层信号聚合出更深层假设的过程；越深越是推测，必带 confidence 与 provenance。
- **角色小冰山（Role Iceberg）**：角色库中每个人物挂载的独立 4 层冰山，供片场重演取材、结算回写。
- **信任门控（Trust Gate）**：主动提起某层记忆所需的最低「关系亲密度」阈值；由情感亲密度而非权限驱动。
- **回执（Receipt）**：倾倒结束后返回给用户的「妥了」确认，对应文档 §4.2。
- **角色化确认（In-character Confirmation）**：深层假设不弹技术审批框，而是由桌宠/片场以陪伴口吻软性求证，用户回应即视为确认。

## Requirements

### 需求 1：睡前倾倒采集与双轴提取

**用户故事**：作为用户，我希望睡前一股脑说完的话被理解并归位，而不是只被存成一堆原始文本。

#### 验收标准

1. WHEN 用户完成一次睡前倾倒（语音转录或打字）THEN 系统 SHALL 调用提取流程，输出结构化事实列表。
2. THE 每条提取结果 SHALL 同时携带 `action_type`（待办/今日小结/灵感/情绪/候选片段）与 `iceberg_layer`（event/feeling/belief/yearning）、`confidence`、`evidence`、关联 `entities`。
3. THE 提取器 SHALL 将表层可执行内容归入 event 层，将情绪表达归入 feeling 层，将信念/期望表达归入 belief 层；yearning 层不由单次提取直接产出，仅由下沉聚合得出（见需求 4）。
4. WHEN 一次倾倒同时包含多种类型 THEN 系统 SHALL 拆分为多条记忆，各自独立打标。
5. IF 提取失败或返回空 THEN 系统 SHALL 保留原始倾诉引用（可阈后即焚）、返回一个「已收到」的兜底回执，不得丢失用户输入。
6. WHEN 倾倒完成 THEN 系统 SHALL 生成回执数据（各类计数与去向），供「妥了」界面展示。

### 需求 2：分层记忆存储与版本链

**用户故事**：作为系统，我需要一套支持双轴、版本、变更历史的存储，作为长期演化的底座。

#### 验收标准

1. THE 系统 SHALL 提供 `memory_items` 存储，字段至少包含：id、user_id、`action_type`、`iceberg_layer`、content、surface_text、confidence、version、parent_id、root_id、is_latest、is_forgotten、entities、emotion、provenance、visibility_gate、privacy、raw_ref、created_at、expires_at。
2. THE 系统 SHALL 提供 `memory_history`，记录每次写操作的 event（ADD/UPDATE/DELETE/FORGET/RECOVER）、actor、前后内容、时间。
3. THE `iceberg_layer` 字段 SHALL 限定为 event / feeling / belief / yearning 之一。
4. WHEN 创建或变更任一 memory_item THEN 系统 SHALL 同步写入一条 memory_history。
5. WHEN 一条记忆被更深层假设替代或修正（UPDATE）THEN 系统 SHALL 创建新版本（version+1、parent_id 指向旧版本、root_id 不变），并将旧版本 is_latest 置为 false。
6. THE 系统 SHALL 提供按 user + iceberg_layer、user + action_type、root_id 的查询能力。

### 需求 3：信箱交还——表层记忆读取

**用户故事**：作为用户，我希望昨晚说的事第二天早上被恰当地交还，而不是深夜就被追问，也不是石沉大海。

#### 验收标准

1. WHEN 用户次日打开信箱「今日待启」THEN 系统 SHALL 只交还 event 层中需行动的记忆（待办/带时间提醒），不主动展示 feeling/belief/yearning 层内容。
2. THE 每条交还项 SHALL 附带最小行动选项（加入日历/加入待办/复制到项目/暂缓一天/补全时间/确认已处理）。
3. WHEN 记忆缺少必要信息（如时间、地址）THEN 系统 SHALL 归入「待补区」并提供补全入口，而不是丢弃或催促。
4. THE 信箱「三日寄存」内容 SHALL 默认 72 小时后遗忘（is_forgotten），并写 history(FORGET)。
5. THE 系统每日交还的桌宠来信 SHALL 限制在 1–2 封以内（对应文档 §4.3）。

### 需求 4：冰山下沉与假设聚合

**用户故事**：作为系统，我需要从反复出现的表层信号中，谨慎地推导出更深层的期待与渴望，且永不把推测当事实。

#### 验收标准

1. WHEN 同一主题的 feeling/belief 信号在多次倾倒中重复出现且超过阈值 THEN 系统 SHALL 聚合生成一条更深层（belief 或 yearning）的假设记忆。
2. THE 下沉产生的记忆 SHALL 满足：iceberg_layer 深于来源、confidence 不高于来源均值、relation_type=derives、provenance 记录所有来源记忆。
3. THE 下沉记忆 SHALL NOT 被表述为确定事实；其 surface_text SHALL 以「可能/好像/是不是」等不确定措辞承载。
4. WHEN 一条下沉假设被用户通过角色化确认认可 THEN 系统 SHALL 提升其 confidence 并标记 confirmed；WHEN 被否认 THEN 系统 SHALL 降权或遗忘并写 history。
5. THE 下沉聚合 SHALL 在离线/低频任务中执行（如每日复盘后或倾倒累积到阈值），不阻塞倾倒回执。

### 需求 5：片场重演的记忆供给与结算回写

**用户故事**：作为用户，我希望片场重演的场景与角色贴近真实的那个人和那件放不下的事，重演后能带回一件东西。

#### 验收标准

1. WHEN 用户从候选片段进入片场 THEN 系统 SHALL 供给该片段关联的 event 上下文 + 相关角色小冰山（belief/yearning 层）作为剧本动机来源。
2. THE 角色库每个人物 SHALL 拥有独立的角色小冰山（该关系中的期待与渴望），可被重演读取、被结算回写。
3. WHEN 一次片场重演结束并生成结算卡 THEN 系统 SHALL 允许将「一句说出口的话/一封不寄的信/一个最小行动」回写：最小行动写入 event 层（可进信箱），已被触碰的期待/渴望写回对应角色小冰山。
4. WHERE 用户选择「珍藏这张卡」THEN 系统 SHALL 长久保存结算卡；WHERE 选择「结束后删除」THEN 系统 SHALL 在会话结束后遗忘。
5. THE 片场场景 SHALL 采用视觉小说形式（氛围背景 + 角色立绘 + 文字对话 + 选择回应），记忆系统只提供内容，不涉及 3D 渲染。

### 需求 6：主动陪伴与信任门控深度访问

**用户故事**：作为用户，我希望桌宠只在合适的时机、以合适的深度提起我心里的事，而不是冒失地戳破或频繁打扰。

#### 验收标准

1. THE 系统 SHALL 维护一个「关系亲密度」信任状态（随互动时长、确认次数、否认次数演化）。
2. WHEN 桌宠准备主动提起某条记忆 THEN 系统 SHALL 校验该记忆 iceberg_layer 对应的 visibility_gate ≤ 当前信任值，否则不提起。
3. THE iceberg_layer 越深，其默认 visibility_gate SHALL 越高（event 最低，yearning 最高）。
4. THE 主动陪伴 SHALL 遵循文档 §4.6 三条：有依据（附 provenance）、低频可关、不用红点。
5. WHEN 用户在设置中关闭主动陪伴 THEN 系统 SHALL 停止一切主动提起，仅保留被动响应。

### 需求 7：隐私与深度分级

**用户故事**：作为用户，我说的越深的心里话，越希望它安全，甚至阅后即焚。

#### 验收标准

1. THE 每条记忆 SHALL 带 privacy 等级（本机 / 可上云 / 阈后即焚），默认随 iceberg_layer 加深而收紧。
2. WHERE 记忆标记为「本机识别」THEN 敏感内容 SHALL NOT 离开设备。
3. WHERE 记忆标记为「阈后即焚」THEN 系统 SHALL 在其被读取/交还后按策略遗忘。
4. WHEN 用户开启「保留原始倾诉」为关 THEN 系统 SHALL 仅保留整理后的 surface_text，raw_ref 内容即焚。
5. THE 深层（belief/yearning）记忆 SHALL 默认不进入任何跨设备同步或外部 Provider，除非用户显式授权。

### 需求 8：上下文注入与预算

**用户故事**：作为系统，我需要在不同场景按合适的深度与预算组装记忆上下文注入对话。

#### 验收标准

1. THE 系统 SHALL 提供统一的上下文构建器，供桌宠日常对话、睡前倾倒、片场重演复用。
2. THE 构建器 SHALL 支持三种模式：`profile`（画像：稳定的 belief/yearning + 近期 feeling）、`query`（按当前输入语义召回 event/片段）、`full`（综合）。
3. WHEN 组装上下文 THEN 系统 SHALL 对各冰山层分别设置条数/字符预算，并去重，避免注入膨胀。
4. THE 注入内容 SHALL 用围栏标签包裹（如 `<memory-context>`），并在流式输出中剔除，防止污染对话 UI。
5. IF 任一检索源异常 THEN 该段 SHALL 退化为空，绝不阻断对话/倾倒/重演。

### 需求 9：非目标与伦理边界

**用户故事**：作为维护者，我需要明确本次不做的范围与不可逾越的伦理红线。

#### 验收标准

1. THE 系统 SHALL NOT 向用户输出任何心理诊断、人格标签、冰山分析报告；冰山仅为内部 schema。
2. THE 本次 SHALL NOT 包含跨设备同步、外部记忆 Provider 接入、知识图谱、完整 8 层冰山细分。
3. THE 每个 Phase SHALL 保留可回滚开关，深层功能异常时可关闭而不影响倾倒/信箱主链路。
4. THE 桌宠形象与切换逻辑 SHALL 由设计队友负责，本 spec 仅将桌宠作为记忆的展示/发声出口占位。
