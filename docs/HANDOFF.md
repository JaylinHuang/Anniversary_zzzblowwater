# 跨设备交接说明

本文档方便你在另一台电脑继续完善本项目。更短的入口见根目录 [`README.md`](../README.md)。

## 1. 项目背景

| 项 | 说明 |
|----|------|
| 群 | QQ 群「zzz吹水群」（绝区零） |
| 站点定位 | 周年庆 + 日常社区据点（Web 优先，单机可部署） |
| 正日周年 | 每年 7/10 |
| 今年庆典日 | **2026-08-04**（推迟举办） |
| 技术栈 | Next.js 15 App Router · TypeScript · Tailwind v4 · sql.js（`data/app.db`） |
| 访问控制 | 全站群口令墙；会话 cookie；角色 `member` / `moderator` / `admin` |

设计与任务拆解在 OpenSpec：

- 主变更：`openspec/changes/zzz-anniversary-community-hub/`
- Agent 相关：`openspec/changes/member-agents-dm-roster/`（**规格仍偏旧「自动名册」；实现已改为管理员手动建档**，见下文「已知漂移」）

## 2. 当前进度（截至推送时）

### 已完成（可运营的主功能）

- [x] 口令墙、注册建档、会话；**首个建档用户为 admin**（本机曾手动把 `sr.11` 提为 admin）
- [x] 模块 feature flag + `/admin` 开关 / 口令修改 / 备份相关能力
- [x] 首页品牌区、倒计时、每日金句、签到、聚光灯、同星期怀旧等
- [x] 群友图鉴、时光卷轴、群聊归档（TXT 导入 / 预览 / 撤销 / 金句）
- [x] 趣味统计、祝福墙与时间胶囊
- [x] 派对游戏：扭蛋、每日签、群梗考试、合作拼图、**猜说话人**
- [x] 活动报名与投票、Meme 馆、人物关系星图
- [x] OneBot/NapCat webhook 实时同步（可选）
- [x] 群友 Agent：**管理员手动建档**（姓名、插画、绑定 QQ）+ 一对一单聊（不进群归档）
- [x] UI/UX 一轮整理：导航主入口 +「更多」、仅 admin 见「管理」、Toast / Confirm / `apiFetch`

### 未完成 / 待完善（建议下一台设备优先）

1. **群聊历史导入受阻**：新版 QQ（NT）常无 TXT 导出；需旧版导出、或 OneBot 只覆盖上线后消息、或增强导入格式。
2. **OpenSpec 与实现漂移**：Agent 已从「自动水位线名册」改为「管理员手动建档」，`member-agents-dm-roster` 规格/README 旧段落需同步。
3. **真实语料与运营**：样本库可测通，正式上线要导入真实群记录、标金句、配 LLM/OneBot。
4. **生产部署**：优先 Zeabur（见 `docs/DEPLOY-ZEABUR.md`）；Volume 挂 `/app/data`、改口令；勿用 Vercel（SQLite 不持久）。
5. **体验打磨**：游戏出题仍有部分 `prompt`；移动端导航；空状态与权限文案可继续统一。

## 3. 新设备上手

```bash
git clone <本仓库 URL>
cd Anniversary_zzzblowwater   # 或你的本地目录名
npm install
cp .env.example .env
# 按需编辑 .env：SITE_PASSPHRASE、LLM_*、ONEBOT_*
npm run db:init               # 若尚无 data/app.db
npm run db:seed               # 可选：里程碑/题目/公告
npm run db:sample-import      # 可选：脱敏样本聊天（测归档/统计/猜说话人）
npm run dev
```

打开 http://localhost:3000 ，口令见 `.env` / `.env.example` 的 `SITE_PASSPHRASE`。

**注意：**

- `.env` 与 `data/app.db` **不会**进 Git。换机后是新库；旧机数据需自行拷贝 `data/app.db` 与 `data/uploads/`（若有）。
- 管理员：第一个成功建档的用户；或运行 `npx tsx scripts/promote-admin.ts`（以脚本说明为准）。
- 自测：`npm run test:logic` / `npm run test:all` / `npm run smoke`（smoke 需先 `npm run dev`）。

## 4. 关键路径速查

| 路径 | 说明 |
|------|------|
| `src/app/(site)/` | 各业务页面 |
| `src/app/api/` | API 路由 |
| `src/lib/` | 解析、鉴权、名册、游戏规则等 |
| `src/lib/nav.ts` | 顶栏主入口 /「更多」分层 |
| `src/components/ToastProvider.tsx` | Toast + Confirm |
| `src/lib/api-client.ts` | 统一 `apiFetch` |
| `scripts/` | 初始化、种子、自测、提权 |
| `openspec/changes/` | 规格与任务清单 |
| `data/app.db` | 运行时数据库（本地，不入库） |

## 5. 已知规格漂移（改代码前先读）

| 主题 | 规格说法 | 当前实现 |
|------|----------|----------|
| Agent 入册 | 按归档发言量自动基线/阈值准入 | **仅管理员**在 `/agents` 手动创建；可软禁用；同 QQ 可复活 |
| README Agent 段 | 曾写「首次建册 / 扫描准入」 | 以页面与 `src/lib/roster.ts`、`.env.example` 注释为准 |
| 口令 | `.env` | 管理员可在后台改口令，改后以 DB `site_settings.gate_passphrase_hash` 为准 |

## 6. 群聊归档怎么用（跨设备也适用）

1. 管理员打开 `/archive`，粘贴 QQ 导出 TXT（格式：`时间 昵称(QQ号)` + 正文）。
2. 预览 → 确认入库；导错可撤销批次。
3. 作用：检索、金句、趣味统计、猜说话人、Agent 语料计数等的数据源。
4. 新版 QQ 往往**没有导出**：历史靠旧客户端/第三方；之后可用 OneBot 增量同步。

## 7. 建议的下一轮工作顺序

1. 同步 OpenSpec / README 与「手动 Agent」实现。
2. 解决历史聊天进站（导出或机器人）。
3. 配 LLM，建几个真实群友 Agent 验收单聊。
4. 庆典前：口令、备份、种子里程碑、祝福墙与活动页内容。
5. 部署到 VPS / Docker（见 README「国内部署」）。
