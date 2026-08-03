# 吹水一周年 · 绝区零群社区站

QQ 群「zzz吹水群」周年庆社区（Web 优先，面向国内服务器单机部署）。

**跨设备继续开发请先读：[`docs/HANDOFF.md`](docs/HANDOFF.md)**（背景、进度、待办、路径速查）。

## 关键日期

- 正日周年：**每年 7 月 10 日**
- 今年庆典活动日：**2026 年 8 月 4 日**（推迟）

## 快速开始

```bash
npm install
cp .env.example .env
npm run db:init          # 首次需要
npm run dev
```

浏览器打开 http://localhost:3000 ，默认口令见 `.env.example` 的 `SITE_PASSPHRASE`。  
**第一个成功建档的用户会成为 admin。**

```bash
npm run db:seed           # 里程碑 / 题目 / 庆典公告
npm run db:sample-import  # 试导入脱敏样本聊天
npm run db:seed-lore      # 人物关系星图野史样本
npm run test:logic        # 无服务依赖的逻辑自测
npm run test:all          # 逻辑 + 若干 demo + smoke（smoke 需先起服务）
```

## 公网部署（推荐 Zeabur）

用 **Docker + 持久卷** 上线（**不要用 Vercel**：SQLite 无法持久化）。

- **Zeabur（优先，国内访问通常更好）**：[`docs/DEPLOY-ZEABUR.md`](docs/DEPLOY-ZEABUR.md)
- Railway：[`docs/DEPLOY-RAILWAY.md`](docs/DEPLOY-RAILWAY.md)

共同点：Volume 挂载 **`/app/data`**，并设置 `SITE_PASSPHRASE`。

## 国内部署（VPS / Docker）

推荐 Docker / 任意 Linux VPS：

```bash
docker build -t zzz-anniversary .
docker run -d -p 3000:3000 \
  -e SITE_PASSPHRASE='你的群口令' \
  -v /opt/zzz-data:/app/data \
  zzz-anniversary
```

数据与上传文件落在 `data/`（请做定期备份）。`.env` 与 `data/*.db` 不进 Git。

## 功能模块（现状）

- 口令墙、角色权限、模块开关、管理后台（含改口令）
- 首页：品牌首屏、倒计时、签到 / 金句 / 聚光灯等
- 群友图鉴、时光卷轴、群聊归档（TXT 导入 + 金句）
- 趣味统计、祝福墙 / 时间胶囊
- 派对游戏：扭蛋、签文、问答、拼图、猜说话人
- 活动报名与投票、Meme 馆、人物关系星图
- OneBot/NapCat 实时同步（可选）
- 群友 Agent：管理员手动建档 + 一对一单聊

顶栏：**常用 5 入口 +「更多」**；「管理」仅 admin 可见。交互反馈走 Toast / Confirm。

## 方案 B：机器人实时同步

1. 在 `.env` 配置：

```env
ONEBOT_ACCESS_TOKEN=一串足够长的随机令牌
ONEBOT_GROUP_ID=你的QQ群号
```

2. 重启服务后，在管理后台可看到 Webhook：

`http://你的域名/api/webhooks/onebot`

3. NapCat / OneBot 将 **HTTP 上报** 指向该地址，鉴权使用：

`Authorization: Bearer <ONEBOT_ACCESS_TOKEN>`

4. 群内新消息会进入归档批次 `onebot-live`（自动脱敏、按 message_id 去重）。

> 历史一年仍建议用管理员导出导入；新版 QQ（NT）常无 TXT 导出。机器人主要覆盖「上线之后」的新消息。

## 群友 Agent（手动建档）

1. （可选）导入带 QQ 号的群聊 TXT，便于语料计数与人设抽样。
2. 配置大模型：

```env
LLM_API_BASE=https://api.deepseek.com/v1
LLM_API_KEY=sk-xxx
LLM_MODEL=deepseek-chat
AGENT_PERSONA_SAMPLE_SIZE=120
AGENT_DRIFT_EVERY_N_TURNS=8
AGENT_DM_DAILY_LIMIT=40
```

3. 管理员打开 `/agents`，填写展示名、插画、绑定 QQ 建档（可软禁用）。
4. 成员点进卡片进入 **一对一单聊**；对话只属于当前用户，**不进**群聊归档。

> OpenSpec 里 `member-agents-dm-roster` 仍可能描述旧的「自动水位线名册」；以本 README 与代码为准，规格待同步。

## OpenSpec

- 主社区规格：`openspec/changes/zzz-anniversary-community-hub/`
- Agent 变更（有漂移）：`openspec/changes/member-agents-dm-roster/`
