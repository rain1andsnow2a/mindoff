# MindOff 手动测试流程

面向在 App 里点着测的人。**第一部分**全是可以直接复制粘贴进输入框的中文文本；
**第二部分**是 App 里暂时还没有采集入口的功能（速度/手机使用），用命令模拟。

- 后端：`http://223.109.142.152:8000`（前端默认已连它）
- 服务器看日志：`ssh root@223.109.142.152 "cd /opt/mindoff && docker compose logs -f backend"`
- 每个步骤都标了「预期」，对不上就把那一段日志贴出来

> ⚠️ 线上是新库 + 新 JWT 密钥。手机上装过旧包的话，先退出登录或清应用数据，
> 否则会一路 401（旧 token 验不过）。

---

## 0. 建账号

任选一组，注册页直接填：

```
测试账号一
用户名：miluTest01
密码：mindoff2026
```

```
测试账号二
用户名：miluTest02
密码：mindoff2026
```

**预期**：注册成功直接进主界面，底部四个 Tab（陪伴/信箱/片场/我的）都能点开。

---

## 1. 陪伴 Tab：文字对话

进「陪伴」，逐条发（一条一条发，别一次粘完，这样能看出它是否记住上一句）：

```
今天开了三个会，脑子有点炸。
```

```
其实最烦的是下周三要交的季度复盘，我一个字都还没写。
```

```
算了不说这个了，你觉得晚上该吃点什么
```

**预期**：
- 回复温和、不催你、不给一二三条建议清单
- 第二句之后它应该知道"季度复盘"这件事，第三句转话题时不会硬掰回去
- 后台会静默抽出一条待办（下周三季度复盘），在「我的 → 记忆」里能看到

---

## 2. 陪伴 Tab：语音通话 / 按住说话

点通话按钮，对着手机念（这段口语化，专门用来测转写标点）：

```
我今天真的有点撑不住了，就是那种，明明没干什么大事，但整个人是空的。晚上回家坐在沙发上，连灯都不想开。
```

**预期**：
- 转写文字实时出现（**注意**：流式转写返回的是累计全量文本，界面应整体替换，不是越拼越长）
- 桌宠有语音回复；文字字幕和语音内容一致
- 语音合成失败时应保留字幕不报错

---

## 3. 睡前倾倒

进倾倒页，把这一整段粘进去（故意混了待办、情绪、灵感、人物，用来验证五类存储的分类）：

```
今天很杂。上午跟妈打了个电话，她又提我什么时候回家，我说这周末看看，结果又聊到工作，最后有点不耐烦就挂了，挂完就后悔。下午跟阿哲对了一下项目，他说下周一之前要把接口文档给他，这个我必须记住。晚上刷手机的时候突然想到一个点子，如果把片场那种"重来一次"的形式用在面试模拟上应该挺有意思。然后就是有点累，一种说不上来的累，不是身体的那种。
```

**预期**：
- SSE 流式回执，一条条浮现，不是转圈等半天
- 分类结果里应该出现：
  - 待办：下周一之前给阿哲接口文档
  - 灵感：把重来一次的形式用在面试模拟
  - 情绪：说不上来的累（这条会进三日寄存，7 天后自动真删）
  - 人物：妈、阿哲
- 「我的 → 记忆」里能看到，且**不会**出现任何心理诊断或人格标签

---

## 4. 片场（重点，这次改的就是这里）

### 4.1 描述你的场景

「片场 → 描述一个你想进入的场景 → 用文字描述」，三组任选，建议至少测两组，
好确认「场景整理」是真的在读你说的话：

**第一组：吵架后**

```
我想回到上周和朋友吵架之后。地点在学校门口，她准备打车离开。她平时比较敏感，生气后会假装不在意，但其实很希望我先道歉。我想试着把她叫住。
```

**第二组：医院（完全换一个场景，用来对比）**

```
昨天在医院走廊，我爸刚做完检查坐在长椅上等报告。他一向不肯说自己难受，怕我担心就一直说没事。我想跟他说我可以陪着他，不用硬撑。
```

**第三组：信息故意给得很少（测它会不会瞎编）**

```
我想重新说一次那天的话。
```

### 4.2 场景整理页 —— 这一步的预期

点「我说完了」后进「场景整理」，会先转一下（在调 LLM），然后出五行：

| 你输入 | 地点 | 人物 | 对方当前行动 | 对方性格 | 你想尝试 |
|---|---|---|---|---|---|
| 第一组 | 学校门口 | 朋友 | 准备打车离开 | 平时比较敏感、生气后假装不在意、希望对方先道歉 | 想把她叫住 |
| 第二组 | 医院走廊 | 我爸 | 刚做完检查坐长椅等报告 | 不肯说自己难受、怕孩子担心说没事 | 跟他说可以陪他不用硬撑 |
| 第三组 | *(空，灰字提示"你没提到")* | *(空)* | *(空)* | *(空)* | 重新说那天的话 |

**必须满足**：
- 换一段描述，五行内容必须跟着变（以前这五行是写死的 mock，不管你说什么都显示"学校门口/朋友/准备打车离开"）
- 你没提到的字段**留空并灰字提示**，不能凭空编出一个地点
- 「对方性格」只能是行为描述，**不能出现**"回避型""讨好型""焦虑症"这类标签或诊断
- 副标题：正常是"有不准确的地方可以告诉我"；如果 LLM 挂了会变成"我没太听清，下一步你可以自己补上"

### 4.3 角色设定三步

**第一步（称呼/关系）**：会用上一步整理到的内容预填（第一组会预填"朋友"）。
可以改成：

```
小雨
```

**第二步（介绍一下 TA）**，粘这段：

```
她平时说话不冲，但生气的时候就一句话都不说了。我道歉她会说没事没事，其实心里还记着。她很少主动找我，都是我先开口。上次也是我买了奶茶她才理我。
```

**第三步（TA 在这场对话中）** 点「整理一下」后的预期，应该出现 2–5 条类似：

- 生气时倾向沉默而不是争辩
- 说没事时心里可能还记着
- 很少主动开口，习惯等对方先来

**必须满足**：这几条是从你上面那段话来的，换一段描述内容要跟着变；
同样不能出现人格标签。你说得很少时它应该少给几条或提示直接进入，而不是凑满五条。

「有一点不像？补充一句…」框里可以填：

```
她其实比我说的更固执一点
```

### 4.4 进入场景（视觉小说）

点「就是这样的，进入场景」，会进入搭建动画（分三段：写剧本 → 画背景 → 画立绘），
实测 **20–30 秒**，第一次可能更久。

**预期**：
- 搭建过程有呼吸光环 + 扫光进度条 + 阶段文案轮换，不是干等一行静态字
- 有背景图和角色立绘（生图失败会降级成渐变背景，不该报错）
- 台词是针对你那个场景写的（比如第一组应该出现校门口、出租车、她别过头这类细节）
- 底部给 2–3 个「另一种回应」
- **万一搭建失败**：应该盖一层「没搭起来」+「再试一次」，
  且你填的称呼/介绍**还在**；不该把你甩回「谁在你面前」第一步重新填

选一个选项推进，或点「自己说」粘这句：

```
你先别走，刚才那句话是我不对，我不该那么说你。
```

推进 3 轮左右会自然收束，出结算卡。

### 4.5 「TA 不太像」校准

体验中途点暂停 → 「TA 不太像」，粘这句：

```
她不会这么快就软下来，她会先反问我一句
```

**预期**：后续剧情按校准后的设定走；同时「我的 → 角色档案」里这个人的备注会追加一条带日期的校准记录。

### 4.6 结算卡

**预期**：结算卡有一句你这次"试着说出口的话"的回看，可以选择珍藏（进「信箱 → 长久珍藏」）、再来一次、或离开。文案不能声称治好了你或改变了真实记忆。

---

## 5. 信箱 Tab

**预期**：
- `今日待启`：第 3 步倾倒出的待办在这里
- `桌宠来信`：每天最多 1–2 封；每晚 21:30（东八区）自动写一封晚间来信；每周日 20:00 一封周报
- `三日寄存`：第 3 步那条"说不上来的累"在这里，带到期时间
- `长久珍藏`：4.6 珍藏的结算卡在这里

想立刻看到晚间来信不用等到 21:30，用第二部分的命令手动触发。

---

## 6. 我的 Tab：偏好设置

主动陪伴相关的新开关都在这里，逐个试：

| 项 | 默认 | 测法 |
|---|---|---|
| 定时陪伴时刻 | 08:00 / 15:00 / 20:00 | 改成**当前时间 + 2 分钟**，等一轮（后台每 5 分钟扫一次） |
| 安静时段 | 23:00 – 07:00 | 改成覆盖当前时间，验证非定时类信号不再打扰 |
| 临时静音 | 关 | 打开后所有主动消息一律不发 |
| 每日主动上限 | 6 次 | 改成 1，触发一次后第二次应被拦 |
| 节假日祝福 / 驾车陪伴 / 天气关心 / 屏幕关心 | 全开 | 单独关掉对应类型不再触发 |

**预期**：改完刷新页面值还在；填 `25:00` 这种非法时间应该报错而不是静默存下。

---

# 第二部分：App 里还没有采集入口的功能

驾车速度和手机使用时长需要客户端后台采集，目前 App 还没做这部分，
所以先用命令模拟上报。**把下面整段粘进 PowerShell 就行**（会自动注册一个临时账号）。

## 7. 驾车陪伴（定位维度）

```powershell
$B = "http://223.109.142.152:8000/api/v1"
$u = @{ username = "drive$(Get-Random -Maximum 99999)"; password = "mindoff2026" }
$tok = (Invoke-RestMethod "$B/auth/register" -Method Post -Body ($u | ConvertTo-Json) -ContentType "application/json").access_token
$H = @{ Authorization = "Bearer $tok" }
Write-Host "账号：$($u.username)"

# 造 8 条 64~71km/h、跨 6 分钟的速度样本（阈值：≥30km/h 持续 ≥2 分钟）
$now = [DateTime]::UtcNow
$samples = 0..7 | ForEach-Object {
  @{ occurred_at        = $now.AddMinutes(-6 + $_ * 0.7).ToString("o")
     current_speed_kmh  = 64.0 + $_
     max_speed_kmh      = 78.0
     activity_type      = "driving"
     is_driving         = $true
     client_event_id    = "ps-$(New-Guid)" }
}
$r = Invoke-RestMethod "$B/signals/motion" -Method Post -Headers $H `
      -Body (@{ samples = $samples } | ConvertTo-Json -Depth 5) -ContentType "application/json"
$r | ConvertTo-Json -Depth 6
```

**预期**：`driving_mode_active: true`，且 `decision` 里 `allowed: 1`、`channel: "voice"`，
`message` 是一句 **40 字以内**、不要求你看手机的话，例如
「注意保持车距哦，周末出行慢一点也没关系～」。

再用同一账号在 App 里登录（用上面打印的用户名 + `mindoff2026`），
「信箱 / 桌宠气泡」应该能看到这条主动消息。

## 8. 手机使用异常（屏幕关心）

接着上面的 `$B` / `$H` 继续跑。异常判定要 7 天基线，所以先灌历史再灌今天：

```powershell
# 7 天基线：每天 120 分钟、拿起 60 次
1..7 | ForEach-Object {
  $d = [DateTime]::Now.AddDays(-$_).ToString("yyyy-MM-dd")
  Invoke-RestMethod "$B/signals/usage" -Method Post -Headers $H -ContentType "application/json" `
    -Body (@{ stat_date = $d; total_screen_time_minutes = 120; pickup_count = 60
              night_usage_minutes = 10; top_apps = @() } | ConvertTo-Json -Depth 5) | Out-Null
}
# 今天：屏幕 420 分钟 / 拿起 210 次 / 夜间 100 分钟 / 单个社交 App 190 分钟 —— 四项全中
Invoke-RestMethod "$B/signals/usage" -Method Post -Headers $H -ContentType "application/json" `
  -Body (@{ total_screen_time_minutes = 420; pickup_count = 210; night_usage_minutes = 100
            top_apps = @(@{ app_name = "抖音"; usage_minutes = 190 }) } | ConvertTo-Json -Depth 5)

# 立刻跑一轮检测 + 决策（正常是后台每 5 分钟自动跑）
Invoke-RestMethod "$B/signals/tick" -Method Post -Headers $H | ConvertTo-Json -Depth 6
```

**预期**：信号分 0.9（0.3 夜间 + 0.25 屏幕暴增 + 0.2 拿起暴增 + 0.15 社交 App）。
文案必须是**轻轻的关心**，绝不能说教或指责（不能出现"你玩手机太久了"这种）。
如果 AI 判定 suppress 也是**正常且正确**的行为——不打扰优先。

## 9. 天气关心 / 城市变化（定位维度）

```powershell
# 上报一个模糊位置（只存最近一次，不存轨迹）
Invoke-RestMethod "$B/preferences/location" -Method Post -Headers $H -ContentType "application/json" `
  -Body (@{ lat = 31.23; lon = 121.47; city = "上海" } | ConvertTo-Json)
Invoke-RestMethod "$B/signals/tick" -Method Post -Headers $H | ConvertTo-Json -Depth 6

# 换个城市，验证"旅途问候"
Invoke-RestMethod "$B/preferences/location" -Method Post -Headers $H -ContentType "application/json" `
  -Body (@{ lat = 30.27; lon = 120.15; city = "杭州" } | ConvertTo-Json)
Invoke-RestMethod "$B/signals/tick" -Method Post -Headers $H | ConvertTo-Json -Depth 6
```

**预期**：
- 第一次上报城市只落基线、**不打扰**（这是有意设计）
- 换成杭州后才可能触发一句不打探的问候，绝不会猜你为什么去那里
- 天气关心只在白天 7–21 点触发，且依赖定位；彩云天气 key 线上已配好，
  `events` 里能看到真实天气证据，例如
  `{"condition":"晴","temperature":35,"city":"杭州","reasons":["hot_35c"]}`
- **天气不是有异常就发**：基础分 × 类型权重（0.8）要 ≥0.4 才进决策。
  过线的有暴雨/大雨/暴雪/大雪/雷阵雨/冰雹/重度霾、≥35℃、≤0℃、大风、中度霾；
  中雨、雾这类算下来 0.36，会停在 pending 直到过期——不为一场中雨打扰你，是有意的

## 10. 查"为什么发了 / 为什么没发"

```powershell
Invoke-RestMethod "$B/signals/events"     -Headers $H | ConvertTo-Json -Depth 8   # 信号+证据+最终得分
Invoke-RestMethod "$B/signals/decisions"  -Headers $H | ConvertTo-Json -Depth 8   # AI 判定+理由
Invoke-RestMethod "$B/signals/deliveries" -Headers $H | ConvertTo-Json -Depth 8   # 待投递消息
```

`events` 里每条都有 `score`（检测器基础分）、`final_score`（× 类型权重 × 新鲜度衰减）、
`status`（pending / processed / expired）和 `evidence`。`final_score` 要 ≥0.4 才会进 AI 决策。
`decisions` 里的 `reason` 会直说为什么 suppress（比如"证据薄弱""深夜保护"）。

## 11. 手动触发晚间来信 / 周报（不想等到 21:30）

```powershell
ssh root@223.109.142.152 "docker exec mindoff-backend python -c ""from app.db import SessionLocal; from app.services.evening_letter import run_evening_letters_all; print(run_evening_letters_all(SessionLocal()))"""
ssh root@223.109.142.152 "docker exec mindoff-backend python -c ""from app.db import SessionLocal; from app.services.weekly_report import run_weekly_reports_all; print(run_weekly_reports_all(SessionLocal()))"""
```

**预期**：返回每个用户的 `sent: true/false`；App 刷新「信箱 → 桌宠来信」能看到。
晚间来信当天已发过会幂等跳过，不会重复。

---

## 附：出问题时先看这三处

| 现象 | 先查 |
|---|---|
| 全是 401 | App 里退出登录重新注册（旧 token 是旧密钥签的） |
| 搭片场转一会儿又被甩回「谁在你面前」 | 已修：旧版请求层写死 15s 超时，而建场景要 20–30s（LLM+两张图），超时被当成失败。若仍复现，看 `docker compose logs --tail 80 backend` 里 `POST /api/v1/scenes` 的耗时 |
| 场景整理转圈很久 / 报错 | `docker compose logs --tail 50 backend \| grep -i theater` |
| 场景没有图 | 生图被风控或超时，会降级成渐变背景；查 `grep -i scene_images` |
| 主动消息一条都没有 | `GET /signals/decisions` 看 reason；再确认「我的」里没开静音、没到每日上限 |
| 语音没声音 | `POST /ai/tts` 返回 `{"url": null}` 即合成失败，前端应保留字幕 |
