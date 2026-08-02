## ADDED Requirements

### Requirement: One-to-one DM with a single agent
系统 SHALL 为每位已入册 Agent 提供一对一单聊入口；一次会话中用户仅与该 Agent 对话，MUST NOT 再提供多 Agent 同台选人接话作为主路径。

#### Scenario: Open DM with one agent
- **WHEN** 已登录成员打开某一入册 Agent 的聊天页
- **THEN** 系统进入仅含该 Agent 的单聊界面

### Requirement: Session-scoped conversation context
系统 SHALL 将单聊消息归属到「当前用户 × 该 Agent」的会话；默认对话上下文仅包含本会话消息。用户开始新会话后，旧会话消息 MUST NOT 自动进入新会话的模型上下文。

#### Scenario: New session clears context
- **WHEN** 用户对本 Agent 开启新会话并发送消息
- **THEN** 模型上下文不包含上一会话的消息正文

### Requirement: Per-user isolation of DM records
用户 A 与某 Agent 的单聊记录 SHALL 对用户 B 不可见；读取与写入 MUST 校验会话归属当前用户。

#### Scenario: Another user cannot read DM
- **WHEN** 用户 B 请求用户 A 与某 Agent 的会话消息
- **THEN** 系统拒绝或返回空，且不泄露内容

### Requirement: DM must not enter group chat archive
单聊消息 MUST NOT 写入群聊归档表或导入批次；群聊检索与趣味统计 MUST NOT 包含单聊内容。

#### Scenario: Send DM does not create archive row
- **WHEN** 用户在单聊中发送一条消息并收到 Agent 回复
- **THEN** 群聊归档中不出现这些消息记录

### Requirement: No preferential self-bot entry
系统 MUST NOT 将「与自己对应 QQ 的 Agent 单聊」作为默认推荐或置顶优先策略（列表可按名册规则排序，但不因「是用户本人」而特殊置顶）。

#### Scenario: Roster list without self boost
- **WHEN** 用户打开 Agent 列表且其 QQ 也在名册中
- **THEN** 系统不因「本人」而强制置顶该 Agent
