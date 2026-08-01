# theater — 喵灵重演剧场场景库

three.js 低多边形风格化预置场景（非写实数字人——"假"恰恰给人安全感）。
全部程序化建模，无外部资源，可完全离线运行。

## 场景

| hash | 场景 | 分组 |
|---|---|---|
| `#campsite` | 露营地（篝火/帐篷/星空） | 深夜通话 |
| `#bedroom` | 卧室窗前（月夜城市剪影） | 深夜通话 |
| `#seaside` | 海边（月光海面/浪沫） | 深夜通话 |
| `#dining` | 家中餐桌（白天，双人物对坐） | 那晚 |
| `#airport` | 机场候机厅（白天） | 离开的路上 |
| `#station` | 高铁站台（白天） | 离开的路上 |

## 运行

```bash
npm install
npm run dev     # 开发服务器
npm run build   # 产出单文件 dist/index.html —— 双击即可离线打开（赛场无网兜底）
```

剧场引擎按 URL hash 直达场景（如 `index.html#seaside`），供重演模块命中模板时跳转。

## 结构

- `src/main.js` — 渲染器 + 场景切换 + UI
- `src/figure.js` — 关节化风格化人物/行李箱。人物类型（child/student/adult/elderly）、
  体型（slim/average/stout）、服装（casual/uniform/coat/skirt）、发型（short/long/ponytail/bun）、书包；
  13 种姿态：standing/sitting/phone/lookingBack/headDown/sittingGround（静态）+
  walking/waving/arguing/comforting/hugging/handingItem/crying（`userData.update(t)` 逐帧动画）
- `src/utils.js` — 星空/月亮/太阳/远山/树木等共享件；`TIME_OF_DAY` 白天/黄昏/夜晚预设
  （黄昏：地平线暖橙渐变 + 低角度可见暖阳 + 暖色侧光，不做成"变暗的白天"）
- `src/scenes/*.js` — 六个场景，各导出 `{ group, update, camera }`

> 生成式场景（AI 产 SceneSpec JSON → 拼装）的人物/时段能力在 App 端
> `frontend-demo/src/theater/`（`figure/` 目录 + `generated/`），与本库接口保持对齐；
> 后端白名单与 prompt 在 `backend/app/services/scene/scene_spec.py`，改动需三端同步。
