# 功能模块补全

**Bar：** 已登录群友在活动页能看出自己报没报名、投了哪一项；空列表写出下一步。首页没有归档时，记忆回响给出导入入口，不能只剩一句说明和一颗点了没反应的按钮。对照 `docs/gauntlet/modules-bar.md`。

**Started：** 2026-10-03
**Status：** stopped
**Budget：** 24 轮（构建加评审算一轮）· 已完成 24 轮
**停止条件：** 预算用尽。第 19–24 条都过了，不再加轮。
**Bar 追加：** 第 17–18 条已过。本波见第 19–20 条：统计空态、胶囊解锁日格式。已过八成预算，不再回头加轮。

## Routing

| Role | Model | Tier |
|---|---|---|
| Lead | 当前会话 | T3 |
| 功能构建 | claude-sonnet-5-5-high | T2 |
| 画面与新颖 | claude-fable-5-1-thinking-high | T3 |
| 评审 | claude-opus-5-thinking-high | T3 |
| 收束 | 未跑。两条都已过，预算用在评审上 | T2 |

功能件从 T2 起。评审只用 T3，且和构建不是同一个模型。

## Pieces

| Piece | Rounds | Last verdict | Open gap | Spend |
|---|---|---|---|---|
| 活动中枢：我的报名和投票 | 1 | won | 无。交接：全库没有把活动 status 写成非 open 的入口，「已关闭报名」在真实数据里走不到 | 2 |
| 首页记忆回响：没归档时的去向 | 3 | won | 无。交接：加载文案样式和同页其他占位不一致 | 5 |
| 活动中枢：关闭与重开报名 | 1 | won | 无。交接：关闭后连点取消，两次请求可能把报名又插回去 | 2 |
| Meme 馆：我是否赞过、空馆 | 2 | won | 无。交接：请求一直不返回时，这张图的数字和按钮会停在请求中 | 4 |
| 报名写入：同一次决定删或拒 | 1 | won | 无。交接：没有测试锁住「回调必须同步」 | 2 |
| 夜街粒子 | 1 | won | 无。交接：窄屏遮罩会盖住下半粒子，本波第 10 条接着做 | 2 |
| 首页打卡：最近 7 天 | 1 | won | 无。交接：格子没有标出哪一天是今天 | 2 |
| 祝福墙：我的与今日剩余 | 1 | won | 无。交接：没有测试钉住满额不再插入；未解锁胶囊作者也看不见原文，本波第 12 条接着做 | 2 |
| 玩法：签、答题、今日点亮次数 | 1 | won | 无。交接：玩法日期用 UTC，和打卡的本地日期错开，本波第 13 条接着做 | 2 |
| 窄屏粒子与玩法短动画 | 1 | won | 无。交接：首页窄屏左侧净空里粒子偏少；评审未能开浏览器 | 2 |
| Meme 馆评论 | 1 | won | 无。交接：评论一次全量渲染，没有展开上限 | 2 |
| 胶囊：作者提前看见自己的原文 | 1 | won | 无。交接：解锁判断用 SQLite UTC 的 date('now')，东八区会晚八小时，本波第 14 条接着做 | 2 |
| 玩法日期与打卡对齐 | 1 | won | 无。交接：猜说话人每日上限仍拿 UTC 的 created_at 去比本地日期，本波第 15 条接着做 | 2 |
| 胶囊解锁日与本地今天对齐 | 1 | won | 无。交接：解锁日字符串未校验，非 YYYY-MM-DD 会让比较失效 | 2 |
| 猜说话人每日上限按本地日 | 1 | won | 无。交接：day_key 列仍可空 | 2 |
| 打卡成功的印章动画 | 1 | won | 无。交接：is-stamping 播完不摘类；评审未能打开页面 | 2 |
| Agent 单聊：额度与失败撤回 | 1 | won | 无。交接：页面跨本地零点不刷新时，顶部数字仍是昨天的 | 2 |
| Meme 馆点赞：挂起后回退 | 1 | won | 无。交接：刷新一直不回来时，已结算的覆盖还会钉着 | 2 |
| 趣味统计：没有消息时的去向 | 2 | won | 无。交接：时段柱只画有发言的小时，空小时被省略 | 4 |
| 胶囊解锁日必须是日期 | 0 | building | — | — |

## Round log

### 活动中枢 round 1
- Verdict: won
- Gap: none（评审点出关闭活动没有写入入口，但判定已过标杆）
- Evidence: `src/app/(site)/events/page.tsx`、`EventsClient.tsx`、`src/app/api/events/route.ts`、`src/lib/events-rules.ts`
- Route: 构建 claude-sonnet-5-5-high · 评审 claude-opus-5-thinking-high · spend 2

### 记忆回响 round 1
- Verdict: lost
- Gap: 同星期请求失败时 catch 静默，整块消失
- Evidence: `src/components/HomeExtras.tsx`、`src/app/api/memory-echo/route.ts`
- Route: 构建 claude-sonnet-5-5-high · 评审 claude-opus-5-thinking-high · spend 2

### 记忆回响 round 2
- Verdict: won
- Gap: none（评审点出 loading 期间整块不在，但判定已过标杆）
- Evidence: `src/components/HomeExtras.tsx` 失败、空、有内容、回响空态四条路径
- Route: 构建 claude-sonnet-5-5-high · 评审 claude-opus-5-thinking-high · spend 2
- 停止条件: 预算用尽。两条都过了，不再加轮。

### 追加预算后

### 关闭报名 round 1
- Verdict: won
- Gap: none（评审点出关闭后连点取消可能把报名插回去，但判定已过）
- Evidence: `src/app/api/events/route.ts` 的 set-status 与 rsvp
- Route: 构建 claude-sonnet-5-5-high · 评审 claude-opus-5-thinking-high · spend 2

### Meme 馆 round 1
- Verdict: won
- Gap: 点赞覆盖在刷新后不清除，数字钉在自己上一次的结果
- Evidence: `GalleryClient.tsx`、`src/app/api/gallery/route.ts`
- Route: 构建 claude-sonnet-5-5-high · 评审 claude-opus-5-thinking-high · spend 2

### 同星期加载 round 1
- Verdict: won
- Gap: none（加载文案样式和同页其他占位不一致，判定已过）
- Evidence: `src/components/HomeExtras.tsx` loading 分支
- Route: 构建 composer-2.5-fast · 评审 claude-opus-5-thinking-high · spend 2

### Meme 馆 round 2
- Verdict: won
- Gap: none（请求一直不返回时覆盖不会过期，判定已过）
- Evidence: `src/app/(site)/gallery/GalleryClient.tsx` 覆盖的 base 与 refresh
- Route: 构建 claude-sonnet-5-5-high · 评审 claude-opus-5-thinking-high · spend 2
- 停止条件: 追加的 8 次用尽。这三块都过了，不再加轮。

### 报名写入 round 1
- Verdict: won
- Gap: none（没有测试锁住回调必须保持同步，判定已过）
- Evidence: `src/app/api/events/route.ts` rsvp 分支在同一个同步 `withDb` 里读状态、判断、删除或插入
- Route: 构建 claude-sonnet-5-5-high · 评审 claude-opus-5-thinking-high · spend 2

### 夜街粒子 round 1
- Verdict: won
- Gap: none（窄屏 `.hero-text-scrim` 盖住下半粒子，判定已过；第 10 条接着做）
- Evidence: `src/components/fx/NightDust.tsx`、`globals.css`、首页 / 门厅 / 站内布局挂载。评审未能开浏览器，按源码分层判断
- Route: 构建 claude-fable-5-1-thinking-high · 评审 claude-opus-5-thinking-high · spend 2

### 祝福墙 round 1
- Verdict: won
- Gap: none（没有测试钉住满额不再插入；作者看不见自己未解锁胶囊的原文）
- Evidence: `src/lib/wish-rules.ts` 单条条件插入；`WishClient.tsx` 按 user id 标「我的」
- Route: 构建 claude-sonnet-5-5-high · 评审 claude-opus-5-thinking-high · spend 2

### 玩法记录 round 1
- Verdict: won
- Gap: none（`gamesDayKey` 用 UTC，东八区凌晨会当成昨天）
- Evidence: `games/page.tsx` 首屏读 fortune_draws、quiz_answers、puzzle_daily
- Route: 构建 claude-sonnet-5-5-high · 评审 claude-opus-5-thinking-high · spend 2

### 窄屏粒子与玩法动画 round 1
- Verdict: won
- Gap: none（首页窄屏净空里粒子偏少；评审按 CSS 几何判断，没能打开页面）
- Evidence: `NightDust.tsx` 窄屏上移、`GachaCapsule.tsx`、拼图 `is-lighting`；减少动态效果时停
- Route: 构建 claude-fable-5-1-thinking-high · 评审 claude-opus-5-thinking-high · spend 2

### Meme 馆评论 round 1
- Verdict: won
- Gap: none（评论一次全量渲染，没有展开上限）
- Evidence: `gallery/page.tsx` 从 media_comments 读取；空白在写入前被拒绝；发送后 refresh
- Route: 构建 claude-sonnet-5-5-high · 评审 claude-opus-5-thinking-high · spend 2

### 胶囊原文 round 1
- Verdict: won
- Gap: none（解锁比较用 `date('now')`，SQLite 按 UTC）
- Evidence: `SELECT_CAPSULES_FOR_VIEWER_SQL` 未解锁且非作者时 content 为 NULL
- Route: 构建 claude-sonnet-5-5-high · 评审 claude-opus-5-thinking-high · spend 2

### 玩法日期 round 1
- Verdict: won
- Gap: none（猜说话人上限仍用 UTC created_at 对比本地 todayKey）
- Evidence: `gamesDayKey` 改为调用 `todayKey`；求签、拼图、打卡加成同一键
- Route: 构建 claude-sonnet-5-5-high · 评审 claude-opus-5-thinking-high · spend 2

### 胶囊解锁日 round 1
- Verdict: won
- Gap: none（unlock_on 未校验成 YYYY-MM-DD）
- Evidence: `capsuleViewerParams` 绑定 `todayKey()`；非作者未解锁 content 为 NULL
- Route: 构建 claude-sonnet-5-5-high · 评审 claude-opus-5-thinking-high · spend 2

### 猜说话人上限 round 1
- Verdict: won
- Gap: none（day_key 列仍可空）
- Evidence: guess-start 按本地 day_key 计数，并在同一次 withDb 里满额拒绝插入
- Route: 构建 claude-sonnet-5-5-high · 评审 claude-opus-5-thinking-high · spend 2

### 打卡印章 round 1
- Verdict: won
- Gap: none（is-stamping 播完不摘类；评审未能打开页面）
- Evidence: `HomeExtras.tsx` 只在 POST 成功后给今天那格加类；减少动态效果时 animation: none
- Route: 构建 claude-fable-5-1-thinking-high · 评审 claude-opus-5-thinking-high · spend 2

### Agent 单聊 round 1
- Verdict: won
- Gap: none（页面跨零点不刷新时额度数字不归零）
- Evidence: `dm-limit.ts` 按 day_key 计数；`dm.ts` 满额与插入同一次 withDb；失败删除用户那句；页面首屏传入 initialQuota
- Route: 构建 claude-sonnet-5-5-high · 评审 claude-opus-5-thinking-high · spend 2

### 点赞挂起 round 1
- Verdict: won
- Gap: none（router.refresh 永不回来时，已结算覆盖仍钉着）
- Evidence: `apiFetch` 的 timeoutMs 会 abort；超时删除 override；成功覆盖的 base 绑定刷新前的 items
- Route: 构建 claude-sonnet-5-5-high · 评审 claude-opus-5-thinking-high · spend 2

### 趣味统计空态 round 1
- Verdict: won
- Gap: 有消息但没有时段柱或没有词时，那一块仍是空白
- Evidence: `stats/page.tsx` 在 totalMessages === 0 时三块都有通往 /archive 的下一步
- Route: 构建 claude-sonnet-5-5-high · 评审 claude-opus-5-thinking-high · spend 2

### 胶囊日期格式 round 1
- Verdict: won
- Gap: none（校验只在这一条 POST 里，表上没有 CHECK）
- Evidence: `parseCapsuleUnlockOn` 拒绝 2026-1-5 与 2026-02-30；合法日期在 INSERT 前通过
- Route: 构建 claude-sonnet-5-5-high · 评审 claude-opus-5-thinking-high · spend 2

### 趣味统计空列表 round 2
- Verdict: won
- Gap: none（时段柱只包含有发言的小时，空小时不画）
- Evidence: `stats/page.tsx` 三块各自按 leaderboard / hourBuckets / words 是否为空给 /archive；有柱子时 0% 仍渲染
- Route: 构建 claude-sonnet-5-5-high · 评审 claude-opus-5-thinking-high · spend 2
- 停止条件: 24 轮预算用尽。

### 近七天打卡 round 1
- Verdict: won
- Gap: none（没有把服务端的「今天」标在对应格子上，判定已过）
- Evidence: `src/lib/checkin-rules.ts`、`src/lib/checkin.ts`、`src/components/HomeExtras.tsx`
- Route: 构建 claude-sonnet-5-5-high · 评审 claude-opus-5-thinking-high · spend 2
