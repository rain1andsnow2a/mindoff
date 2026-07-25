# AGENTS.md — MindOff

思绪托管 + 情感陪伴 App（AdventureX 黑客松项目）。一句话：把明天的事还给明天，
把没闭环的过去在片场重演里了结。产品文档：`MindOff项目功能文档-精简版.md`。

## 仓库结构

| 目录 | 内容 |
|---|---|
| `backend/` | FastAPI + SQLite + LangGraph 后端（AI 网关 `/ai/*` + 业务层 `/api/v1/*`），详见 `backend/README.md` |
| `backend/docs/api-design.md` | REST 接口契约（各节标注 ✅ 已实现 / 未实现） |
| `.kiro/specs/memory-system/` | 双轴记忆系统 spec（requirements/design/tasks），Phase 0–6 已全部实现 |
| `theater/` | three.js 重演剧场场景库（六个预置场景），详见 `theater/README.md` |
| `mindoff-proto/` | 前端 HTML 原型（4-Tab IA，Vite 原型；`npm run dev`） |
| `frontend-demo/` | React Native / Expo 移植版（`npm run web` 浏览器预览 / `npm run android`），详见 `frontend-demo/README.md` |
| `deploy/` | 后端 Docker 部署（`deploy.py` 一键装 Docker/同步/重建；`docker-compose.yml`） |
| `references/` | 参考架构文档 |

线上后端：`http://223.109.142.152:8000`（容器 `mindoff-backend`）。前端默认连它，
本地联调在 `frontend-demo/.env` 写 `EXPO_PUBLIC_API_BASE`。

## 常用命令

```bash
# 后端
cd backend && uv run uvicorn app.main:app --reload    # 起服务（:8000）
cd backend && uv run alembic upgrade head             # prod 迁移
# 测试脚本：见 backend/README.md「验证」一节；Windows 需 PYTHONUTF8=1，
# service 层脚本需 PYTHONPATH=.

# 剧场
cd theater && npm install && npm run dev              # 开发
cd theater && npm run build                           # 产出单文件 dist/index.html（双击可离线打开）
```

## 硬约定（新人必读）

1. **dev 库 `backend/mindoff.db` 由 create_all 建**，不加列；改列手动 ALTER 或删库。
   模型/字段变更必须同步写 `backend/alembic/versions/` 迁移（revision id ≤ 32 字符）。
2. 新模型注册 `backend/app/models/__init__.py`；新 router 挂载 `backend/app/main.py`。
3. 所有业务接口必须 `Depends(get_current_user)` 做用户隔离，URL 不放 userId。
4. 伦理红线：不诊断、不贴人格标签、不把推测当事实；vulnerable/core 记忆
   默认 local 不外发（走 `app/services/privacy.py` 判定）。
5. `mindoff.db*`、`.env` 不入库（见 `.gitignore`）。

## 远程仓库

`https://github.com/rain1andsnow2a/mindoff`（私有）。任务看板：Linear Dayfire 团队 mindoff 项目。
