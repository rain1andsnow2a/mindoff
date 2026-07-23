# theater — MindOff 重演剧场场景库

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
- `src/figure.js` — 风格化人物/行李箱（standing/sitting/phone 三种姿态）
- `src/utils.js` — 星空/月亮/远山/树木等共享件
- `src/scenes/*.js` — 六个场景，各导出 `{ group, update, camera }`
