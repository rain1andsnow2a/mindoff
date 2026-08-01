# 语音通话页 · 字幕通话版

`frontend-demo/src/screens/VoiceCall.tsx` 的重构记录。三方案对照原型 + 验收脚本。

## 为什么改

原来这屏有**两个都想当主角的区块**：上半 `callStage`（名字＋光圈＋提示＋挂断）和
下半 `conversation`（开关＋对话卡）。手机窄屏下两块上下平铺各占一半，于是两边都不够
用——光圈 184px 大而无信息，对话区被压到 180~220px 只能看两句。而 `useRealtimeCall`
里光圈接通后其实只是个音量指示器。

三个方案都是「把主角还给对话」的不同解法，**最终采用方案 B**。

| 方案 | 做法 |
|---|---|
| A · 接通即折叠 | 光圈只在 `connecting` 时占满，接通后收成顶栏 34px 呼吸点 |
| **B · 字幕通话（已采用）** | 拆掉对话卡容器，字幕直接落在底色上，最新一句最大；音量律动收成底部细波纹 |
| C · 状态即背景 | 光圈化为整屏极淡光晕，前景只有对话与挂断 |

## 看原型

直接双击 `index.html`。三台手机并排，每台都是活的状态机——点手机下方的
「接通中 / 在听 / 你在说 / 在想」切状态，也能点顶栏喇叭切语音回复。

## 跑验收

```bash
npm install
# 另开一个终端起 web dev server（端口需为 8093，脚本里写死了）
cd ../../frontend-demo && npx expo start --web --port 8093
```

```bash
npm run verify            # 回归：错误文案不重复、error 态不计时、两视口不溢出
npm run verify:subtitles  # 字幕分层：量字号/透明度，确认最新一句最大
npm run verify:geometry   # 几何：挂断触达尺寸、安全区、横向溢出
npm run prototype         # 给 index.html 三方案原型截图
```

`verify:subtitles` 需要页面有字幕内容。web 上 `isPcmAvailable=false` 没有麦克风，
只能看到空状态——当时是靠临时注入模拟字幕验的，补丁验完即删。要复现得自己在
`lines` 的 `useMemo` 里临时塞几条假数据。

截图 PNG 未入库（约 9.7MB 二进制），需要就重跑脚本生成。

## 已知未验

真机上的 `level` 律动手感、TTS 出声、连续说话时字幕流的滚动跟随都没验过。
波纹振幅公式是 `3 + shape × level × 15`，大概率要按真实音量再调。

`VoiceCall.original.tsx` 是改动前的原文件，留作对照。
