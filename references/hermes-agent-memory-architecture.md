# Hermes Agent 记忆（Memory）设计架构参考

> 来源：`nousresearch/hermes-agent`（克隆于 `D:\bigproject\bansheng-life-dev\references\hermes-agent`）  
> 提取时间：2026-07-23  
> 本文档从源码与官方文档中提炼出 Hermes Agent 的记忆体系架构，供栖光项目参考。

---

## 1. 总体设计哲学

Hermes Agent 的记忆体系遵循 **“分层、有界、可插拔、 consent-aware（用户可控）”** 的设计原则：

1. **分层记忆**：
   - **L1 热记忆**：固定写入系统提示（system prompt），始终可用但容量严格受限。
   - **L2 会话搜索**：本地 SQLite + FTS5 全量索引，按需检索，零 LLM 成本。
   - **L3 外部长期记忆**：可插拔 Provider（Honcho、Mem0、Hindsight 等），提供语义搜索、知识图谱、用户建模等能力。

2. **有界容量**：热记忆使用字符上限而非 token 上限，避免系统提示无限膨胀；超出上限时由 Agent 主动整理，而不是静默截断。

3. **可插拔架构**：通过 `MemoryProvider` ABC + `MemoryManager` 统一编排，只允许同时运行一个外部 Provider，避免工具冲突。

4. ** consent-aware 学习循环**：后台自审（background review）自动提取记忆/技能，但提供 `write_approval` 门将写入操作暂存，等用户审批后再落地。

---

## 2. 内置记忆：MEMORY.md / USER.md

### 2.1 两个文件的作用

| 文件 | 用途 | 默认字符上限 | 典型条目数 |
|------|------|-------------|-----------|
| `~/.hermes/memories/MEMORY.md` | Agent 个人笔记：环境事实、项目约定、学到的技巧 | 2200 | 8–15 |
| `~/.hermes/memories/USER.md` | 用户画像：偏好、沟通风格、工作流 | 1375 | 5–10 |

### 2.2 冻结快照模式（Frozen Snapshot）

- 会话启动时从磁盘加载，渲染成系统提示中的固定块，**整个会话期间不变**。
- 这样做是为了保护 LLM 的 prefix cache，提升性能并保证可复现性。
- 会话中通过 `memory` 工具写入的内容会立即落盘，但**不会**立即出现在当前会话的系统提示里，下次会话才生效。

### 2.3 memory 工具

- **动作**：`add` / `replace` / `remove`，支持批量 `operations` 列表原子执行。
- **定位方式**：`replace` / `remove` 通过 `old_text` 子串匹配，不需要完整条目或 ID。
- **容量管理**：写入若会超上限，工具返回错误并附带 `current_entries` 与 `usage`，由 Agent 在同一轮内主动合并/删除后再试；超过 3 次失败则返回 terminal 结果，避免死循环。
- **安全扫描**：所有写入内容先经过 `tools/threat_patterns.py` 的 strict 模式扫描，拦截 prompt injection、凭证外泄、SSH 后门等；命中时将条目替换为 `[BLOCKED: ...]` 占位符。
- **写入门控**：`memory.write_approval: true` 时，所有写入（包括后台自审）先进入待审批队列，通过 `/memory pending` / `/memory approve` 管理。

### 2.4 关键实现类

- `tools/memory_tool.py` → `MemoryStore`
  - 维护 `_system_prompt_snapshot`（冻结）与 `memory_entries / user_entries`（实时）两套状态。
  - 使用 `§` 作为条目分隔符；写文件采用 temp + atomic rename，保证并发安全。
  - 外部漂移检测（`detect_external_drift`）：发现文件被外部工具/并发会话改写时拒绝覆盖并备份。

---

## 3. 会话搜索：Session Search

### 3.1 定位

- 所有 CLI / 消息会话落库到 `~/.hermes/state.db`（SQLite），并启用 **FTS5** 全文索引。
- 提供 `session_search` 工具，零 LLM 调用，直接返回真实消息。

### 3.2 三种调用形态

| 模式 | 参数 | 行为 |
|------|------|------|
| Discovery | `query` | FTS5 检索，按会话谱系去重，返回命中会话的摘要、前后 5 条消息窗口、首尾 bookends |
| Scroll | `session_id` + `around_message_id` | 以某条消息为中心，返回 ±window 条消息 |
| Browse | 无参数 | 按时间返回最近会话列表 |

### 3.3 关键设计

- **谱系（lineage）处理**：通过 `parent_session_id` 链找到根会话，避免压缩/委托产生的子会话重复。
- **来源降级**：`cron` 等自动化来源的命中会被降级，防止其淹没用户真实交互会话。
- **压缩摘要排除**：上下文压缩产生的 `[CONTEXT COMPACTION...]` 消息会被过滤，避免把机器摘要重新引入新会话。

---

## 4. 外部记忆 Provider 架构

### 4.1 MemoryProvider ABC（`agent/memory_provider.py`）

所有外部 Provider 必须实现以下生命周期方法：

| 方法 | 调用时机 | 说明 |
|------|---------|------|
| `name` | 始终 | Provider 短标识 |
| `is_available()` | Agent 初始化前 | 仅检查配置/依赖，**禁止网络调用** |
| `initialize(session_id, **kwargs)` | 会话启动 | 连接后端、创建资源 |
| `system_prompt_block()` | 系统提示组装 | 返回静态 Provider 信息 |
| `prefetch(query, session_id)` | 每轮 API 调用前 | 返回要注入的回忆上下文 |
| `queue_prefetch(query, session_id)` | 每轮结束后 | 后台预热下一轮上下文 |
| `sync_turn(user, asst, session_id, messages)` | 每轮结束后 | 持久化本轮对话 |
| `get_tool_schemas()` | 初始化后 | 返回该 Provider 暴露的工具模式 |
| `handle_tool_call(name, args)` | Agent 调用工具时 | 处理 Provider 自己的工具 |
| `shutdown()` | 进程退出 | 清理连接 |

可选钩子：

| 方法 | 用途 |
|------|------|
| `on_turn_start(turn, message)` | 轮次计数、作用域管理 |
| `on_session_end(messages)` | 会话结束时提取/汇总 |
| `on_session_switch(...)` | `/resume` `/branch` `/reset` `/new` 时切换 session_id |
| `on_pre_compress(messages)` | 上下文压缩前抢救洞察 |
| `on_memory_write(action, target, content, metadata)` | 镜像内置 memory 工具的写入 |
| `on_delegation(task, result)` | 父 Agent 观察子代理完成 |
| `backup_paths()` | 声明 Provider 在 HERMES_HOME 外存储的备份路径 |

### 4.2 MemoryManager（`agent/memory_manager.py`）

`MemoryManager` 是 Agent 与所有 Provider 的唯一集成点：

- **单外部 Provider 限制**：内置 memory 始终存在，但最多只允许注册一个外部 Provider，防止工具模式膨胀和冲突。
- **统一编排**：
  - `build_system_prompt()`：收集所有 Provider 的系统提示块。
  - `prefetch_all(query)`：并行收集回忆上下文，外部 Provider 带超时（默认 8s）。
  - `sync_all(user, asst)`：后台单线程串行写入，保证轮次顺序，且不会阻塞用户看到回复。
  - `queue_prefetch_all(query)`：后台预热下一轮上下文。
  - `handle_tool_call(name, args)`：按工具名路由到对应 Provider。
- **上下文围栏**：通过 `<memory-context>` 标签包装注入内容，并配套 `StreamingContextScrubber` 在流式输出中剔除，防止回忆内容污染 UI。
- **内置 memory 写入镜像**：当 `memory` 工具执行成功的 `add/replace/remove` 后，调用外部 Provider 的 `on_memory_write`，并附带 provenance metadata。

### 4.3 与 Agent 生命周期集成（`agent/agent_init.py`、`run_agent.py`）

```text
AIAgent.__init__
  └─ init_agent()
       ├─ 创建 MemoryStore（内置 memory）
       │    └─ load_from_disk() → 捕获 _system_prompt_snapshot
       ├─ 创建 MemoryManager
       │    └─ 若 memory.provider 配置存在，load_memory_provider() 并 add_provider()
       │    └─ initialize_all(session_id, platform, hermes_home, user_id, ...)
       └─ inject_memory_provider_tools(agent) → 把 Provider 工具注入 Agent 工具面

每轮结束
  └─ _sync_external_memory_for_turn()
       ├─ sync_all(user_text, response_text, session_id, messages)
       └─ queue_prefetch_all(user_text, session_id)

会话边界（CLI 退出 / /reset / gateway 过期）
  └─ shutdown_memory_provider()
       ├─ on_session_end(messages)
       └─ shutdown_all()

session_id 旋转（/new / 上下文压缩）
  └─ commit_memory_session() → on_session_end()
  └─ on_session_switch(new_session_id, parent_session_id, reset, rewound)
```

### 4.4 已集成的 Provider

| Provider | 存储 | 核心能力 | 代表工具 |
|----------|------|---------|---------|
| **Honcho** | Cloud / 自托管 | 跨会话用户建模、辩证推理、peer card、conclusions | `honcho_profile`、`honcho_search`、`honcho_context`、`honcho_reasoning`、`honcho_conclude` |
| **OpenViking** | 自托管 | 文件系统式知识层级、L0/L1/L2 分层加载 | `viking_search`、`viking_read`、`viking_browse`、`viking_remember` |
| **Mem0** | Cloud / 自托管 / OSS | 服务端 LLM 自动提取事实、语义搜索、去重 | `mem0_search`、`mem0_add`、`mem0_update`、`mem0_delete` |
| **Hindsight** | Cloud / 本地 | 知识图谱、实体解析、`hindsight_reflect` 跨记忆综合 | `hindsight_retain`、`hindsight_recall`、`hindsight_reflect` |
| **Holographic** | 本地 SQLite | HRR 代数查询、信任评分、矛盾检测 | `fact_store`（9 动作）、`fact_feedback` |
| **RetainDB** | Cloud | 混合搜索（向量 + BM25 + Rerank）、7 种记忆类型 | `retaindb_profile`、`retaindb_search`、... |
| **ByteRover** | 本地/Cloud | 层级知识树、压缩前自动提取 | `brv_query`、`brv_curate`、`brv_status` |
| **Supermemory** | Cloud / 自托管 | 语义召回、profile 回忆、会话级 graph ingest、多容器 | `supermemory_store`、`supermemory_search`、... |
| **Memori** | Cloud | 结构化长期记忆、工具感知上下文 | `memori_recall`、`memori_recall_summary`、... |

---

## 5. 后台自审学习循环（Background Review）

### 5.1 机制

- 每轮结束后，`run_conversation` 可能调用 `agent/background_review.py` 的 `spawn_background_review`，在**守护线程**中 fork 一个受限的 `AIAgent`。
- fork 继承父 Agent 的运行时（provider、model、凭证、缓存的系统提示），但工具白名单仅限 memory / skill 管理工具。
- 询问 Agent：“本轮是否有值得保存的用户信息或技能更新？”

### 5.2 记忆 vs 技能的分工

| 维度 | 记忆（Memory） | 技能（Skills） |
|------|---------------|---------------|
| 保存内容 | 用户是谁、偏好、环境状态 | 如何做某类任务 |
| 触发信号 | 用户透露个人/偏好/期望 | 用户纠正风格/流程、出现可复用技术 |
| 写入工具 | `memory` | `skill_manage` |
| 容量 | 有严格字符上限 | 通过 curator 定期归档/合并 |

### 5.3 成本优化

- 默认使用**主模型**，复用已热的 prompt cache。
- 可配置 `auxiliary.background_review` 指向更便宜的模型；此时 fork 会回放一个**紧凑 digest**（最近 N 轮原文 + 旧轮摘要），避免冷缓存写入完整会话。

---

## 6. 安全与治理

1. **注入/外泄扫描**：memory 内容进入系统提示前必须经过 strict 威胁模式扫描。
2. **写入门控**：`write_approval` 机制防止后台自动写入未经确认的错误假设。
3. **工具名保护**：核心工具名（如 `clarify`、`delegate_task`）不可被外部 Provider 覆盖。
4. **Provider 单例**：防止多个外部记忆后端同时运行导致工具冲突和存储污染。
5. **失败开放**：外部 Provider 初始化、prefetch、sync 失败不会阻塞主流程，仅记录日志。
6. **后台写入串行化**：避免并发写入导致轮次乱序；shutdown 时有 5s 的 bounded drain。

---

## 7. 可借鉴到栖光项目的设计点

| Hermes 设计 | 栖光可借鉴方向 |
|------------|---------------|
| **分层记忆（热/搜索/外部）** | 后端/日记产品可区分“常驻上下文”、“历史会话检索”、“外部知识库”三层 |
| **冻结快照 + 实时落盘** | 系统提示/人格设定在会话内固定，写入立即持久化但下轮生效，兼顾缓存与一致性 |
| **字符上限 + Agent 主动整理** | 不要让记忆无限增长；超限时让模型自己合并/删除，而不是静默截断 |
| **MemoryProvider 插件化** | 后端抽象统一的记忆接口，便于未来接入不同记忆服务（本地向量库、Honcho、Mem0 等） |
| **FTS5 会话搜索** | 本地/后端全量会话索引，支持零 LLM 成本的历史检索 |
| **写入门控 / 审批** | 用户画像、日记摘要等敏感写入支持“暂存-审批”模式，提升可控性 |
| **后台自审 fork** | 可定期对会话做自动摘要/提取，但要限制工具白名单、防止污染主会话 |
| **Provider 单例 + 工具名保护** | 多个记忆/搜索后端不要同时暴露重复工具名，避免模型调用混乱 |

---

## 8. 关键源码文件索引

| 文件 | 职责 |
|------|------|
| `agent/memory_provider.py` | `MemoryProvider` 抽象基类 |
| `agent/memory_manager.py` | `MemoryManager` 统一编排、工具路由、上下文围栏 |
| `tools/memory_tool.py` | 内置 `memory` 工具 / `MemoryStore` |
| `tools/session_search_tool.py` | `session_search` 工具 / FTS5 检索 |
| `agent/background_review.py` | 后台记忆/技能自审 |
| `agent/agent_init.py` | Agent 初始化中创建 MemoryStore / MemoryManager |
| `run_agent.py` | 每轮 sync、会话 shutdown/switch |
| `plugins/memory/__init__.py` | 外部 Provider 发现与加载 |
| `plugins/memory/<name>/__init__.py` | 各 Provider 实现 |
| `website/docs/user-guide/features/memory.md` | 用户文档：内置记忆 |
| `website/docs/user-guide/features/memory-providers.md` | 用户文档：外部 Provider |
| `website/docs/developer-guide/memory-provider-plugin.md` | 开发者文档：自定义 Provider |

---

*文档结束*
