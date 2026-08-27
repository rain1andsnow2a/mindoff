# harmony — 喵灵 HarmonyOS NEXT 客户端

ArkTS + ArkUI 原生鸿蒙版，后端与安卓/Web 端共用同一套 `/api/v1/*` 接口。

## 目录

| 路径 | 内容 |
|---|---|
| `AppScope/` | 应用级配置：bundleName `com.mindoff.harmony`、版本号、应用图标 |
| `entry/` | 主模块（HAP） |
| `entry/src/main/ets/common/Theme.ets` | 设计 token，与 `frontend-demo/src/design-system/tokens.ts` 保持同值 |
| `entry/src/main/ets/common/Api.ets` | REST 接口与会话恢复（AssetStoreKit token、401 refresh single-flight） |
| `entry/src/main/ets/core/network/` | POST SSE 客户端和增量解析器 |
| `entry/src/main/ets/features/companion/` | 真实伙伴首页与流式文字聊天 |
| `entry/src/main/ets/pages/Auth.ets` | 登录/注册 |
| `entry/src/main/ets/pages/Index.ets` | 主框架（底部 Tab 壳） |

## 开发约定

1. 颜色/字号/圆角/间距只能用 `Theme.ets` 的语义 token，不写死数值。
2. 日夜模式跟随系统：页面用 `@StorageProp('isNight')` 取当前模式，经 `themeOf()` 取色。
3. 普通 REST 走 `Api.ets`，流式请求走 `core/network/SseClient.ets`；接口契约与 `frontend-demo/src/api.ts` 保持同名同语义。
4. 最低兼容 API 12（HarmonyOS NEXT 5.0 基线），见根 `build-profile.json5`。

## 打开与运行

1. DevEco Studio（D:\DevEco Studio）→ Open → 选择本目录，等待首次 Sync
   （hvigor 插件与 SDK 依赖会自动拉取）。
2. 登录华为开发者账号后，File → Project Structure → Signing Configs 勾选
   **Automatically generate signature**（个人账号免费，模拟器与真机调试都需要）。
3. 运行目标：
   - 本地模拟器：Tools → Device Manager 创建 Local Emulator 后 Run；
   - 云真机：华为开发者联盟「云调试」服务，免真机。
4. debug 默认连现有 `http://223.109.142.152:8000`；release 未配置 HTTPS 时会主动拒绝请求，
   不允许把登录和私密内容降级为明文传输。生产发布前需在 `Api.ets` 配置 HTTPS 地址并验证证书链。

命令行构建（PowerShell）：

```powershell
$env:DEVECO_SDK_HOME='D:\DevEco Studio\sdk'
& 'D:\DevEco Studio\tools\hvigor\bin\hvigorw.bat' assembleHap --mode module `
  -p product=default -p module=entry@default -p buildMode=debug --no-daemon `
  --type-check --max-old-space-size 8192 --stacktrace
```

## 阶段进度

- [x] 可编译工程 + 安全会话 + 登录/注册 + Tab 壳
- [x] 真实伙伴首页 + 米露透明 8 帧等待动画
- [x] POST SSE 技术切片 + 流式文字聊天代码
- [ ] 签名安装、真机五轮对话与异常恢复验收
- [ ] 信箱 / 倾倒 / 待办
- [ ] 片场（three.js 场景走 Web 组件方案：打包 `frontend-demo/src/theater/` 为 rawfile 宿主页）
- [ ] 语音（录音 + /ai/stt + TTS 播放）
