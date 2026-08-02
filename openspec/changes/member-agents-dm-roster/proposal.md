## Why

当前「群友 Agent」做成了多选同台吹水，不符合预期：需要的是按发言量入选的 **一对一单聊 bot**，对话仅归属当前用户、不进群归档，且人设可对每位用户私有漂移。同时需用可配置的水位线名册（基线 Top N、冻结阈值、只增不删、软顶），避免榜单重排导致 Agent 消失。

## What Changes

- **BREAKING**：移除多 Agent 同台房间 / 导演选人接话的交互与 API 语义；改为联系人式单聊。
- 按群聊 **文本发言条数** 建立 Agent 名册：首次建册取 Top `AGENT_ROSTER_BASELINE_SIZE`（默认 25），锁定当时第 N 名票数为 `threshold*`；名册内 Agent **永不因掉榜删除**。
- 之后仅当某人累计文本票数 **严格大于** `threshold*`、尚无 Agent、且未达软顶 `AGENT_ROSTER_SOFT_CAP`（默认 40，可配置）时自动新建 Agent。
- 名册与计数主键为 **QQ 号**；并列用 QQ 号作次要排序键；昵称仅展示。
- 单聊消息只存在于「当前用户 × 该 Agent」的会话层，**不得**写入群聊归档（`chat_messages` / 导入批次）。
- 人设分两层：全站 Base（群语料）+ 每用户 Drift（私有、可跨会话）；对话正文默认只服务本会话上下文。
- **不提供**管理员「手动授予 / 手动添加 Agent」能力；入选仅走自动水位线规则。
- 配置项外置（基线人数、软顶等），禁止把 40/25 写死在业务逻辑中。

## Capabilities

### New Capabilities

- `agent-roster`：水位线名册（基线 TopN、冻结阈值、`>` 准入、只增不删、软顶、QQ 主键、禁止手动授予）
- `agent-dm`：一对一单聊、会话隔离、禁止写入群归档
- `agent-persona`：Base 人设生成（语料抽样）与每用户 Drift 更新

### Modified Capabilities

- （无已归档主规格；实现层将替换现有 `/agents` 多房间行为，以本 change 规格为准）

## Impact

- 影响代码：`src/app/(site)/agents/**`、`src/app/api/agents/**`、`src/lib/persona.ts`、`src/lib/db.ts`、相关 env 与 README。
- 依赖：既有群聊归档作为语料与计票来源；OpenAI 兼容 LLM 配置。
- 数据：新增/调整名册、阈值快照、单聊会话、Drift 表；废弃多 Agent 房间模型（或停止使用）。
- 非目标：手动授予 Agent；优先推荐「和自己的 bot 聊」；把私聊同步进群归档。
