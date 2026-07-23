# Implementation Plan: 双轴记忆系统

## Overview

按「先主链路快赢、再叠加深加工与演化」推进。每个 Phase 独立可回滚，深加工/深层功能异常不影响倾倒/信箱主链路。任务粒度对齐 SDD，逐条可测，`_需求: x.y_` 回溯到 requirements。

- Phase 0：存储底座（双轴 + 版本链 + history）
- Phase 1：睡前倾倒采集与双轴提取
- Phase 2：信箱表层交还（快赢闭环）
- Phase 3：睡前做梦 Agent（每日定时深加工）
- Phase 4：片场供给与结算回写
- Phase 5：信任门控与主动陪伴
- Phase 6：深度隐私 + 上下文注入 + 记忆审阅控制面

## Tasks

### Phase 0：存储底座

- [x] 1. 搭建后端骨架（FastAPI 应用、配置、SQLite 连接、SQLAlchemy 基类、能力开关 settings）
  - 引入 `dreaming_enabled`、`proactive_enabled` 等回滚开关
  - _需求: 2.1, 10.3_

- [x] 2. 定义 MemoryItem 模型与 Alembic 初始迁移（int 主键；layer/kind/depth 枚举校验；版本链字段；索引）
  - revision id ≤ 32 字符
  - _需求: 2.1, 2.3, 2.6_

- [x] 3. 定义 MemoryHistory 模型与迁移，封装「写 item 必写 history」的工具
  - _需求: 2.2, 2.4_

- [x] 4. 实现 MemoryStore：create/get/update/forget/list_by_layer/list_by_kind/list_by_depth，含版本链逻辑与单测
  - _需求: 2.4, 2.5, 2.6_（校验 Property 4、5）

### Phase 1：睡前倾倒采集与双轴提取

- [x] 5. 定义可配置 LLM Provider 封装（超时、重试、结构化输出解析）
  - _需求: 1.1_

- [x] 6. 实现 extractor.extract：LLM 一次产出 [{layer, kind, depth, confidence, evidence, entities, emotion}]，含分类提示词
  - 断言 core 不由单次提取产出
  - _需求: 1.1, 1.2, 1.3, 1.4_（校验 Property 2、3）

- [x] 7. 实现 dump_ingest：raw_ref 落库（可即焚）→ 调 extract → 逐条 store.create；失败兜底不丢输入
  - _需求: 1.5, 7.4_（校验 Property 1）

- [x] 8. 实现 receipt.build 与倾倒完成接口：返回各 kind 计数与去向（做梦 Agent 由 Phase 3 定时任务独立触发，不在此步派发）
  - _需求: 1.6_

### Phase 2：信箱表层交还（快赢闭环）

- [x] 9. 实现 inbox.build_today：只取 depth=surface 需行动记忆，附最小行动选项，缺信息归「待补区」
  - _需求: 3.1, 3.2, 3.3_（校验 Property 6）

- [x] 10. 实现 72h 三日寄存遗忘任务（到期 forget + history(FORGET)）
  - _需求: 3.4_

- [x] 11. 实现 inbox.build_letters：桌宠来信每日 ≤1–2 封的组装与限频
  - _需求: 3.5_

### Phase 3：睡前做梦 Agent（每日定时深加工）

- [x] 12. 搭建 dreaming_agent 有界骨架：固定阶段 recall→cluster→descend→reconcile→forget→prepare，工具白名单=记忆读写，每阶段 try/except 隔离，受 dreaming_enabled 开关控制
  - _需求: 4.1, 4.2, 4.6_（校验 Property 7）

- [x] 13. 实现 descend 下沉：主题超阈值 → LLM 生成更深 depth 假设（confidence ≤ 来源均值、relation_type=derives、provenance 全来源、不确定措辞）
  - _需求: 4.3_（校验 Property 3、7）

- [x] 14. 实现 reconcile 去重消解 + forget 保鲜（profile/state 高置信覆盖低置信、保版本链；过期写 FORGET）
  - _需求: 4.4_

- [x] 15. 实现角色化确认回写 confirm(accepted)：认可提 confidence+confirmed，否认降权/遗忘 + history
  - _需求: 4.5_

- [x] 16. 实现每日定时调度（APScheduler，默认 00:00）+ debug 手动触发端点（POST /api/v1/debug/dream），验证不阻塞主链路
  - _需求: 4.1_（校验 Property 7）

### Phase 4：片场供给与结算回写

- [x] 17. 定义 RoleProfile 模型与迁移（普通档案占位，无冰山/深度）
  - _需求: 5.2_

- [x] 18. 实现 stage.supply(segment)：组装 episodic 上下文 + 相关角色档案 + 相关 vulnerable/core 记忆为剧本动机
  - _需求: 5.1_

- [x] 19. 实现 stage.settle 结算回写：最小行动→新建 surface 记忆（可进信箱）；领悟→关联相关记忆/角色档案笔记；珍藏/即焚分支
  - _需求: 5.3, 5.4_

### Phase 5：信任门控与主动陪伴

- [x] 20. 定义 TrustState 模型与更新逻辑（互动/确认/否认演化 value）
  - _需求: 6.1_

- [x] 21. 实现 proactive.pick + 信任门控：候选按 provenance 排序，过滤 visibility_gate > trust，尊重「关闭主动陪伴」；depth 越深默认 gate 越高
  - _需求: 6.2, 6.3, 6.4, 6.5_（校验 Property 8）

### Phase 6：深度隐私 + 上下文注入 + 记忆审阅控制面

- [x] 22. 实现 privacy 分级落地：depth→privacy 默认映射、本机/即焚策略、vulnerable/core 不外流
  - _需求: 7.1, 7.2, 7.3, 7.5_（校验 Property 9）

- [x] 23. 实现 context_builder：profile/query/full 三模式 + 分层预算去重 + `<memory-context>` 围栏 + 检索容错退化
  - _需求: 8.1, 8.2, 8.3, 8.4, 8.5_（校验 Property 11）

- [x] 24. 实现 memory_review 控制面接口：list（带 provenance + 敏感度软标签）/edit（UPDATE 版本链）/delete（FORGET 不再召回）/按 depth·kind 过滤；断言不输出冰山层名/诊断
  - _需求: 9.1, 9.2, 9.3, 9.4, 9.5, 10.1_（校验 Property 10）

## Task Dependency Graph

```json
{
  "waves": [
    { "wave": 1, "tasks": [1] },
    { "wave": 2, "tasks": [2] },
    { "wave": 3, "tasks": [3] },
    { "wave": 4, "tasks": [4] },
    { "wave": 5, "tasks": [5] },
    { "wave": 6, "tasks": [6] },
    { "wave": 7, "tasks": [7] },
    { "wave": 8, "tasks": [8] },
    { "wave": 9, "tasks": [9] },
    { "wave": 10, "tasks": [10, 11] },
    { "wave": 11, "tasks": [12] },
    { "wave": 12, "tasks": [13, 14, 15] },
    { "wave": 13, "tasks": [16] },
    { "wave": 14, "tasks": [17] },
    { "wave": 15, "tasks": [18, 19] },
    { "wave": 16, "tasks": [20] },
    { "wave": 17, "tasks": [21] },
    { "wave": 18, "tasks": [22, 23] },
    { "wave": 19, "tasks": [24] }
  ],
  "notes": [
    "task 4 依赖 2、3（模型齐备才实现 store）",
    "task 7 依赖 5、6（Provider + extractor）",
    "task 8 仅生成回执，做梦 Agent 由 task 16 的定时调度独立触发",
    "Phase 2（9–11）在 Phase 3 前完成，构成可演示的快赢闭环",
    "task 13/14/15 均依赖 12 的有界骨架，可并行",
    "task 24 审阅面依赖 store（4）与 history，隐私（22）建议先行"
  ]
}
```

## Notes

- **伦理护栏贯穿全程**：任何面向用户的输出都不得包含诊断/人格标签/冰山层名；深层假设一律不确定措辞、附 provenance。
- **主链路优先**：Phase 0–2 完成即具备可演示闭环（倾倒→提取→分层→次日信箱）；做梦/片场/门控/审阅为增量叠加。
- **可回滚**：`dreaming_enabled`、`proactive_enabled` 等开关关闭时，系统退化为纯主链路且不报错。
- **定时隔离**：做梦 Agent 每日凌晨定时运行，失败只记日志、跳过阶段，绝不回滚已完成的倾倒/信箱数据。
- Alembic 每次迁移 revision id ≤ 32 字符。
- 桌宠形象、角色深度建模、片场立绘由设计队友负责，本 spec 仅占位其数据出入口。
