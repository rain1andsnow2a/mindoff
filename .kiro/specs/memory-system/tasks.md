# Implementation Plan: 双轴记忆系统

## Overview

按 Phase 0 → Phase 6 顺序推进。Phase 0–2 打通「倾倒 → 双轴提取 → 分层存储 → 信箱表层交还」主链路（黑客松快赢，独立可交付）；Phase 3–6 为演化能力（下沉聚合、片场供给回写、信任门控主动陪伴、深度隐私），每项以开关控制、可回滚，异常不影响主链路。

## Tasks

### Phase 0：分层存储底座

- [ ] 1. 搭建后端骨架与数据模型
  - 初始化 FastAPI + SQLAlchemy + SQLite 工程与配置开关
  - 定义 `MemoryItem`、`MemoryHistory`（int 主键，字段见设计文档），注册 Base
  - _需求: 2.1, 2.2, 2.3_

- [ ] 2. Alembic 迁移
  - 生成 `memory_items` + `memory_history` 迁移（revision id ≤ 32 字符），本地 upgrade 验证
  - _需求: 2.1, 2.2_

- [ ] 3. MemoryStore CRUD 与版本链
  - 实现 create/get/update/forget/list_by_layer/list_by_action，每次写操作同步写 history
  - UPDATE 维护 version/parent_id/root_id/is_latest
  - _需求: 2.4, 2.5, 2.6_

- [ ] 4. Phase 0 单测
  - CRUD + history 写入 + 版本链一致（Property 3、4）
  - _需求: 2.4, 2.5_

### Phase 1：倾倒采集与双轴提取

- [ ] 5. 倾倒采集入口
  - 实现 `dump_ingest`：接收语音转录/打字文本，raw_ref 落库（支持阈后即焚标记）
  - _需求: 1.1, 1.5, 7.4_

- [ ] 6. 双轴提取器
  - 实现 `extractor.extract`：LLM 分点输出事实列表，每条同时判定 action_type + iceberg_layer + confidence + evidence + entities + emotion
  - 表层→event、情绪→feeling、信念/期望→belief；yearning 不产出
  - 失败/空返回 `[]`，走兜底回执，raw_ref 不丢
  - _需求: 1.2, 1.3, 1.4, 1.5_

- [ ] 7. 提取结果落库与回执
  - 逐条 `memory_store.create`；生成回执数据（各类计数 + 去向）供「妥了」界面
  - _需求: 1.2, 1.6_

- [ ] 8. Phase 1 单测
  - 双轴打标断言（表层/情绪/信念归层）、多类型拆分、失败兜底不丢 raw_ref（Property 1、2）
  - _需求: 1.2, 1.3, 1.4, 1.5_

### Phase 2：信箱表层交还

- [ ] 9. 今日待启构建
  - 实现 `inbox.build_today`：只读 event 层需行动记忆，附最小行动选项；缺信息归「待补区」
  - _需求: 3.1, 3.2, 3.3_

- [ ] 10. 三日寄存与桌宠来信
  - 72h 到期 → forget + history(FORGET)；桌宠来信每日 ≤1–2 封
  - _需求: 3.4, 3.5_

- [ ] 11. Phase 2 单测
  - 深度隔离（只出 event，Property 5）、待补区、72h 遗忘
  - _需求: 3.1, 3.3, 3.4_

### Phase 3：冰山下沉与假设聚合

- [ ] 12. 下沉聚合任务
  - 实现 `descent.aggregate`：聚类同主题 feeling/belief 信号，超阈值 LLM 生成更深层假设
  - 强约束：层级更深、confidence ≤ 来源均值、relation_type=derives、provenance 记录来源、不确定措辞
  - 离线/低频执行，不阻塞回执
  - _需求: 4.1, 4.2, 4.3, 4.5_

- [ ] 13. 角色化确认回写
  - confirm → 提升 confidence + 标记 confirmed；deny → 降权/遗忘 + history
  - _需求: 4.4_

- [ ] 14. Phase 3 单测
  - 下沉不僭越（Property 6）、confirm/deny 回写
  - _需求: 4.2, 4.3, 4.4_

### Phase 4：片场供给与结算回写

- [ ] 15. 角色小冰山存储
  - 定义 `RoleIceberg` 模型 + 迁移；提供按 (user, role, layer) 读写
  - _需求: 5.2_

- [ ] 16. 片场供给
  - 实现 `stage.supply`：候选片段 event 上下文 + 相关角色小冰山（belief/yearning）组装为剧本动机
  - _需求: 5.1, 5.5_

- [ ] 17. 结算回写
  - 实现 `stage.settle`：最小行动 → event 层（可进信箱）；触碰的期待/渴望 → 角色小冰山；珍藏/结束删除分支
  - _需求: 5.3, 5.4_

- [ ] 18. Phase 4 单测
  - 供给取到角色小冰山、结算三类回写路径、珍藏与即焚
  - _需求: 5.1, 5.3, 5.4_

### Phase 5：信任门控与主动陪伴

- [ ] 19. 信任状态
  - 定义 `TrustState` 模型 + 迁移；据互动/确认/否认演化 value
  - _需求: 6.1_

- [ ] 20. 门控主动陪伴
  - 实现 `proactive.pick`：候选按 provenance 充分性排序，过滤 visibility_gate > trust；遵循有依据/低频/无红点；尊重"关闭主动陪伴"
  - _需求: 6.2, 6.3, 6.4, 6.5_

- [ ] 21. Phase 5 单测
  - 信任门控过滤（Property 7）、关闭后无主动发声
  - _需求: 6.2, 6.5_

### Phase 6：深度隐私与上下文注入

- [ ] 22. 深度分级隐私
  - 按冰山层设默认 privacy（event=cloud，其余 local）；本机识别不出设备；阈后即焚读取后遗忘；关闭"保留原始倾诉"只留 surface_text
  - belief/yearning 默认不进同步/外部 Provider
  - _需求: 7.1, 7.2, 7.3, 7.4, 7.5_

- [ ] 23. 共享上下文构建器
  - 实现 `context_builder.build_context`（profile/query/full 三模式），分层预算 + 去重 + `<memory-context>` 围栏 + 流式剔除；任一检索源 try/except 退化为空
  - 供桌宠对话、倾倒、片场复用
  - _需求: 8.1, 8.2, 8.3, 8.4, 8.5_

- [ ] 24. 伦理边界护栏与回归
  - 输出层过滤：任何面向用户文本不含冰山层名/诊断/人格标签（Property 10）
  - 各 Phase 可回滚开关校验；Property 1–10 断言用例回归全绿
  - _需求: 9.1, 9.3_

## Task Dependency Graph

```json
{
  "waves": [
    {"wave": 1, "tasks": [1], "depends_on": []},
    {"wave": 2, "tasks": [2], "depends_on": [1]},
    {"wave": 3, "tasks": [3], "depends_on": [2]},
    {"wave": 4, "tasks": [4], "depends_on": [3]},
    {"wave": 5, "tasks": [5], "depends_on": [3]},
    {"wave": 6, "tasks": [6], "depends_on": [5]},
    {"wave": 7, "tasks": [7], "depends_on": [6]},
    {"wave": 8, "tasks": [8], "depends_on": [7]},
    {"wave": 9, "tasks": [9], "depends_on": [7]},
    {"wave": 10, "tasks": [10], "depends_on": [9]},
    {"wave": 11, "tasks": [11], "depends_on": [10]},
    {"wave": 12, "tasks": [12], "depends_on": [7]},
    {"wave": 13, "tasks": [13], "depends_on": [12]},
    {"wave": 14, "tasks": [14], "depends_on": [13]},
    {"wave": 15, "tasks": [15], "depends_on": [3]},
    {"wave": 16, "tasks": [16], "depends_on": [15, 12]},
    {"wave": 17, "tasks": [17], "depends_on": [16]},
    {"wave": 18, "tasks": [18], "depends_on": [17]},
    {"wave": 19, "tasks": [19], "depends_on": [3]},
    {"wave": 20, "tasks": [20], "depends_on": [19, 12]},
    {"wave": 21, "tasks": [21], "depends_on": [20]},
    {"wave": 22, "tasks": [22], "depends_on": [3]},
    {"wave": 23, "tasks": [23], "depends_on": [3, 12]},
    {"wave": 24, "tasks": [24], "depends_on": [23, 20, 22]}
  ]
}
```

说明：
- Phase 0–2（任务 1–11）为独立可交付主链路，不依赖后续 Phase，黑客松优先完成。
- 任务 16/20/23 依赖 Phase 3 下沉产出的深层记忆（任务 12）才能取到 belief/yearning。
- Phase 4（15–18）与 Phase 5（19–21）在主链路 + 下沉就绪后可并行推进。

## Notes

- 冰山仅为内部 schema，输出层必须过滤层名与诊断措辞（伦理红线，任务 24 校验）。
- 每个 Phase 完成后跑对应单测 + Property 断言回归。
- Alembic 迁移 revision id ≤ 32 字符。
- 桌宠形象/切换由设计队友负责，本 spec 只占位其「发声出口」。
- 主链路与演化链路开关分离；深层功能异常时关开关即回退，不影响倾倒/信箱。
