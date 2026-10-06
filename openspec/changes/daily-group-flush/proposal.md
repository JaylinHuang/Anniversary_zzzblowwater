## Why

群记录现在靠整包归档导入，新发言要到手动再导一次才会进站。实时上报如果每条都立刻写进归档，统计和 Agent 会跟着每句话抖动。需要先把消息洗干净攒起来，每天固定一个时间再灌进归档、Agent 和趣味统计。

## What Changes

- **BREAKING**：OneBot / NapCat 的 HTTP 上报不再立刻写入 `chat_messages`。消息先经现有脱敏与空消息过滤，收成 JSON，停在收件箱。
- 每天北京时间 04:00，把收件箱收成一份 `zzz-archive` JSON，写入新的归档批次。服务若错过 4 点，当天 4 点之后启动时补跑一次；4 点之前不跑。
- 灌库后刷新已绑定群友 Agent 的收录条数，并只为新发言补向量。人设正文仍须手动「重建人设」。
- 趣味统计不另存一份结果。话痨榜、发言时间轴、词云在下次打开页面时读取已灌入的归档。
- 同一消息号重复上报只保留一次。机器人对话仍由现有语料过滤挡住，不进入 Agent 训练和词云；归档本身保留这些消息，供话痨榜使用。
- 工作区里已有一版实现（收件箱、凌晨判断、管理页说明）。本变更把约定记下来，避免和「立刻入库」的旧说明打架。

## Capabilities

### New Capabilities

- `daily-group-flush`：实时收取群消息、清洗成 JSON、每天 04:00 灌入归档并更新 Agent 与趣味统计所读的数据

### Modified Capabilities

- （无已归档主规格）

## Impact

- 代码：`src/lib/live-inbox.ts`、`src/lib/daily-flush.ts`、`src/lib/onebot.ts`、`src/instrumentation.ts`、`src/app/api/webhooks/onebot/route.ts`、`src/app/api/cron/daily-flush/route.ts`、`src/lib/db.ts`、管理页。
- 运行：站点进程要在北京时间 04:00 或之后开着，凌晨循环才会执行。NapCat 需用已在群内的 QQ，HTTP 上报指向 `/api/webhooks/onebot`。
- 环境：`ONEBOT_ACCESS_TOKEN`、`ONEBOT_GROUP_ID`。不新增 npm 依赖。
- 数据：新表 `live_inbox`；新批次文件名形如 `onebot-daily-YYYY-MM-DD.json`。不重导已有全量归档。
