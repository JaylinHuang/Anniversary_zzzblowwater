# 吹水一周年 · 绝区零群社区站

QQ 群「zzz吹水群」周年庆社区（Web 优先，面向国内服务器单机部署）。

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
登录：群口令 + 站内昵称。  
注册：`/gate/register` 绑定 QQ，验证码发到 `QQ号@qq.com`（`.env` 配置 `QQ_SMTP_USER` / `QQ_SMTP_PASS`）。每个 QQ 仅可建一个账号；日常登录不再发验证码。

```bash
npm run db:seed           # 里程碑 / 题目 / 庆典公告
npm run db:sample-import  # 试导入脱敏样本聊天
npm run test:logic        # 无服务依赖的逻辑自测
npm run test:all          # 逻辑 + 若干 demo + smoke（smoke 需先起服务）
```

## 公网部署（推荐 Zeabur）

用 **Docker + 持久卷** 上线（**不要用 Vercel**：SQLite 无法持久化）。

- **Zeabur（优先，国内访问通常更好）**：[`docs/DEPLOY-ZEABUR.md`](docs/DEPLOY-ZEABUR.md)
- Railway：[`docs/DEPLOY-RAILWAY.md`](docs/DEPLOY-RAILWAY.md)

共同点：Volume 挂载 **`/app/data`**，并设置 `SITE_PASSPHRASE`。

## 当前困难

跟群友 Agent 对话时，模型会去整段群聊归档里检索相关发言，内存占用会一下子抬很高，服务器容易直接挂掉。

站点用 sql.js，整库放在一块连续内存里。归档有几十万条消息，一次检索再叠加写回，进程就会退出，页面变成 502。用量图上能看到的峰值，常常只是退出前最后一次采样。

检索已经改成按消息 id 分段，并限制单人向量条数，同一话题的结果也会暂存在浏览器里。使用时一次只跟一个分身聊，等回复结束再换下一个，并避开北京时间凌晨 4 点前后。检索占内存这一头还没有从根上解决。

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
- 群友图鉴、时光卷轴、群聊归档（JSON 导入 + 金句）
- 趣味统计、祝福墙 / 时间胶囊
- 派对游戏：扭蛋、签文、问答、拼图、猜说话人
- 活动报名与投票、Meme 馆、人物关系星图
- 群友 Agent：管理员手动建档 + 一对一单聊。新导入的 JSON 在每天北京时间 04:00 自动重炼相关分身并重建向量

顶栏：**常用 5 入口 +「更多」**；「管理」仅 admin 可见。交互反馈走 Toast / Confirm。

## 群聊更新

历史和增量都用管理员在归档页导入 zzz-archive JSON，导入后留在归档里。站点进程开着时，每天北京时间 04:00 检查有没有还没跟进的新批次；有的话才重炼相关分身并重建向量。没有新文件就不动。

## 群友 Agent（手动建档）

1. （可选）导入带 QQ 号的 zzz-archive JSON，便于语料计数与人设抽样。
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
