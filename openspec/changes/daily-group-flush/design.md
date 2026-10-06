## Context

站点已经能导入整包 `zzz-archive`，也有 OneBot webhook。旧行为是每条群消息立刻写入 `chat_messages`，并马上改 Agent 收录条数。全量归档有 40 万条以上，不能为了增量再导一遍。

GitHub 上可借鉴的现成做法：

- NapCat 的 OneBot 11 HTTP 上报：登录一个已在群里的 QQ，把群消息 POST 到本站。
- QQChatExporter 的定时增量：每天只处理新消息，收成一份导出，不重抓历史。

本站不另起一套协议客户端，只接上报，再用已有脱敏和 `zzz-archive` 解析做门。

## Goals / Non-Goals

**Goals:**

- 群消息实时进入收件箱，正文是洗过的 JSON 字符串。
- 每天北京时间 04:00 把未灌入的 JSON 收成一份归档批次。
- 灌库后更新已绑定 Agent 的收录条数和新发言向量。
- 趣味统计通过读取归档自然更新，不维护第二份统计表。
- 同一 `source_msg_id` 不重复入库。

**Non-Goals:**

- 不自动重建 Agent 的人设正文。
- 不重导已有全量归档，不补 NapCat 断线期间的历史（断线缺口仍靠一次导出，并按消息号去重）。
- 不在本站内登录 QQ，也不新加 npm 依赖。
- 不把图片、语音原文件存进归档；无文字的消息段用现有占位文本（如 `[图片]`）。

## Decisions

1. **推送而不是本站轮询。** NapCat 负责挂在群里并 HTTP 上报。本站只验证 `ONEBOT_ACCESS_TOKEN`，并用 `ONEBOT_GROUP_ID` 丢掉其他群。备选是本站主动拉 `get_group_msg_history`，历史不完整且更容易触发频率限制，只适合以后补洞，不作为主路径。

2. **收件箱与归档分开。** 表 `live_inbox` 保存清洗后的 JSON。`chat_messages` 只在凌晨灌库时增加。这样统计和 Agent 一天变一次，而不是每句话变一次。

3. **清洗沿用现有函数。** 纯文本提取、脱敏、空消息丢弃在写入收件箱时完成。灌库时再把多条 JSON 收成 `format: zzz-archive`、`version: 1`，并走 `parseArchiveJson`，与手动导入同一扇门。

4. **调度放在 Node 进程里。** `instrumentation.ts` 每分钟检查一次。北京时间小时小于 4 不跑；当天已经灌过不跑；4 点之后启动且当天没灌过则补跑。外部也可以用同一令牌 POST `/api/cron/daily-flush`。不引入 cron 库。

5. **Agent 只补增量。** 灌库后对本次出现、且已绑定的 QQ 调用已有的条数重算和「只补缺」向量索引。人设 `system_prompt` 保持手动重建。

6. **趣味统计不写缓存。** 话痨榜、时间轴、词云已经在打开页面时查询 `status = active` 的批次。新批次激活后即生效。机器人名过滤仍在查询侧，不在收件箱丢弃。

## Risks / Trade-offs

- [进程在 4 点前就关掉，当天不再启动] → 消息留在收件箱，下次在 4 点之后启动时补灌。若每天只在凌晨 4 点前开机，需要另挂能打到 `/api/cron/daily-flush` 的外部定时器。
- [NapCat 掉线] → 掉线期间没有上报，收件箱不会凭空补齐。恢复后只继续收新消息。
- [非官方协议账号风险] → 使用单独的、已在群内的号，不用常用号。
- [向量接口失败] → 归档先落库；向量失败只记错误，不回滚消息。下次灌库或手动重建索引可以补。
- [消息号在部分实现里会重复] → 入库前按 `source_msg_id` 去重。没有消息号的上报仍会进入收件箱，无法靠号去重。

## Migration Plan

1. 确认 `.env` 里有 `ONEBOT_ACCESS_TOKEN` 和 `ONEBOT_GROUP_ID`，重启 Next 进程，让凌晨循环加载。
2. NapCat 打开 OneBot 11 HTTP 上报，地址为站点的 `/api/webhooks/onebot`。
3. 发一条测试消息，管理页「收件箱待灌入」应增加，群聊归档条数不应立刻增加。
4. 等到 04:00，或用令牌 POST `/api/cron/daily-flush?force=1` 做一次手动灌库，再看归档批次 `onebot-daily-YYYY-MM-DD.json`、Agent 收录条数和趣味统计。
5. 回滚：停掉 NapCat 上报。已灌入的批次可在归档里停用；收件箱未灌入的行可保留，不自动删除。

## Open Questions

- 无。4 点、只灌增量、不自动重建人设，已按当前约定定下。
