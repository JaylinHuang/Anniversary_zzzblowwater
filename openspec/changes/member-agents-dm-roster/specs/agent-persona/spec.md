## ADDED Requirements

### Requirement: Base persona from group chat samples
系统 SHALL 为每位入册 Agent 维护一份全站共享的 Base 人设（含可供模型使用的 system 指令），其人设素材 MUST 来自该 QQ 在活跃归档中的文本消息抽样，抽样上限 MUST 由配置（如 `AGENT_PERSONA_SAMPLE_SIZE`）约束，不得要求载入全部历史原文。

#### Scenario: Build base from sample
- **WHEN** 系统为新入册或重炼的 Agent 生成 Base 人设且该 QQ 有足够文本样本
- **THEN** 系统保存 Base 人设，且所用样本条数不超过配置上限

### Requirement: Per-user drifting persona
系统 SHALL 为每一对「用户 × Agent」维护私有 Drift 人设层；Drift MUST 仅影响该用户与该 Agent 的对话，不得修改其他用户所见的 Base，也不得写入群归档。

#### Scenario: Drift is private
- **WHEN** 用户 A 与某 Agent 的互动导致 Drift 更新
- **THEN** 用户 B 与同一 Agent 对话时不加载用户 A 的 Drift

### Requirement: Combine base and drift at reply time
生成 Agent 回复时，系统 SHALL 组合 Base 人设与当前用户的 Drift（若存在），并仅附加本会话消息作为对话上下文。

#### Scenario: Reply uses base plus user drift
- **WHEN** 用户在单聊中发送消息且其对该 Agent 已有 Drift
- **THEN** 系统在生成回复时同时使用 Base 与该用户 Drift，且上下文消息仅来自本会话

### Requirement: Drift update without persisting session as group memory
系统 SHALL 支持在会话结束或达到配置的轮次间隔时更新 Drift；该过程 MUST NOT 把单聊正文写入群聊归档。

#### Scenario: Drift refresh after session
- **WHEN** 用户结束与某 Agent 的会话并触发 Drift 更新
- **THEN** 系统更新该用户的 Drift，且群聊归档无新增对应私聊内容
