## 1. 收件箱

- [x] 1.1 增加 `live_inbox`，保存清洗后的 JSON，并用消息号去重
- [x] 1.2 OneBot 上报只写入收件箱，不立刻写入 `chat_messages`
- [x] 1.3 清洗沿用现有纯文本提取、脱敏和空消息丢弃，再收成 JSON 字符串

## 2. 凌晨灌库

- [x] 2.1 北京时间 4 点前不灌；当天已灌过不重复；4 点后启动则补跑一次
- [x] 2.2 未灌入的 JSON 收成 `zzz-archive`，走现有归档解析，写入 `onebot-daily-YYYY-MM-DD` 批次
- [x] 2.3 进程内每分钟检查，并提供带令牌的 `/api/cron/daily-flush`
- [x] 2.4 灌库后刷新已绑定 Agent 的收录条数和缺失向量，不改人设正文
- [x] 2.5 逻辑测试覆盖 4 点窗口、脱敏 JSON 和归档往返

## 3. 接上群

- [ ] 3.1 在 `.env` 写上 `ONEBOT_ACCESS_TOKEN` 和 `ONEBOT_GROUP_ID`，重启站点进程
- [ ] 3.2 用已在群里的 QQ 登录 NapCat，把 OneBot 11 HTTP 上报指到 `/api/webhooks/onebot`
- [ ] 3.3 发一条测试消息，确认管理页收件箱加一，群聊归档条数不变
- [ ] 3.4 等到北京时间 04:00，或用令牌 POST `/api/cron/daily-flush?force=1`，确认新批次、Agent 收录条数和趣味统计
