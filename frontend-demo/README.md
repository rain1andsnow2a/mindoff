# MindOff Mobile（React Native / Expo）

mindoff-proto（Figma Make web 原型）的 React Native 移植版，尽量 1:1 还原。
当前为纯前端 UI + mock 数据，接后端时替换为 `/api/v1` 调用。

## 运行

```bash
npm install
npm start          # Expo Go 扫码（手机与电脑同网段）
npm run android    # 已连 Android 设备/模拟器
npm run web        # 浏览器预览
```

## 结构

- `App.tsx` — 屏幕状态机（onboarding → 4 Tab + 全屏页），含 `?screen=xxx` web 直达钩子（验收用）
- `src/theme.ts` — 白天/夜间双套色板（移植自 proto 的 NK/DAY_VARS）
- `src/components.tsx` — 基础组件（雾背景/桌宠占位/玻璃卡/按钮/气泡/BottomSheet/TabBar…）
- `src/screens/`
  - `Onboarding.tsx` — 欢迎/三种方式/选伙伴/授权
  - `Companion.tsx` — 陪伴主页/对话/模式选择
  - `Dump.tsx` — 睡前倾倒/整理中/回执
  - `Mailbox.tsx` — 信箱四区（来信/今日待启/长久珍藏/三日寄存）+ 两个详情屏
  - `Scene.tsx` — 片场（轮播/创建流/角色设定/体验/结算卡）
  - `Profile.tsx` — 我的/更换伙伴/交接信

## 说明

- web 的 backdrop-filter 以半透明底色近似；motion 动画以 RN Animated 近似；
  信封 3D 翻盖、纸纹颗粒等装饰性细节做了简化。
- 已知：web 导出在窄窗口（<~480px）下首帧布局偏宽（RNW 视口测量问题），
  仅影响浏览器验收截图，原生无此问题。
