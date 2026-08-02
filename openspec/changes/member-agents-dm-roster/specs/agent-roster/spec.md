## ADDED Requirements

### Requirement: Baseline roster from top text speakers
系统 SHALL 在首次成功建册时，按活跃归档中的文本发言条数降序、QQ 号升序，选取前 `AGENT_ROSTER_BASELINE_SIZE`（默认 25，且 MUST 从配置读取）名拥有有效 QQ 号的发送者创建 Agent；该批 Agent SHALL 被标记为永久保留，不得因后续排名变化而删除。

#### Scenario: First successful baseline build
- **WHEN** 管理员或版主触发首次名册生成且文本计票可用
- **THEN** 系统创建不超过配置基线人数的 Agent，并为每人关联 QQ 号与展示昵称

### Requirement: Freeze admission threshold at baseline
系统 SHALL 在首次建册成功时，将当时基线最后一名（第 N 名）的文本发言条数持久化为 `threshold*`，并记录锁定时间等元数据；后续重炼人设 MUST NOT 重算或覆盖已锁定的 `threshold*`（除非产品另行定义的显式「重置名册」能力——本 change 不包含重置踢人）。

#### Scenario: Threshold locked after baseline
- **WHEN** 首次建册完成
- **THEN** 系统存储 `threshold*` 等于基线第 N 名的文本条数，且该值在普通重炼操作后保持不变

### Requirement: Automatic admission strictly above threshold
在 `threshold*` 已锁定后，系统 SHALL 在语料增量后扫描：若某 QQ 尚无 Agent、其累计文本条数严格大于 `threshold*`、且当前 Agent 总数低于软顶，则自动为其创建 Agent。系统 MUST NOT 提供手动授予或手动添加 Agent 的接口或界面。

#### Scenario: Speaker crosses frozen threshold
- **WHEN** 某无 Agent 的 QQ 累计文本条数变为大于已锁定的 `threshold*`，且未达软顶
- **THEN** 系统自动创建对应 Agent

#### Scenario: Equal to threshold does not admit
- **WHEN** 某无 Agent 的 QQ 累计文本条数恰好等于 `threshold*`
- **THEN** 系统不为其创建 Agent

#### Scenario: No manual grant path
- **WHEN** 调用方尝试通过管理「授予/添加 Agent」类操作绕过水位线
- **THEN** 系统不提供该能力（无成功路径）

### Requirement: Soft cap from configuration
系统 SHALL 在 Agent 总数达到 `AGENT_ROSTER_SOFT_CAP`（默认 40，MUST 从配置读取，禁止业务逻辑写死常数）时停止自动新建 Agent；已存在的 Agent MUST NOT 因触顶被删除。

#### Scenario: Soft cap blocks new admission
- **WHEN** 已有 Agent 数等于软顶配置值，且又有 QQ 满足 `>` 阈值条件
- **THEN** 系统不创建新 Agent，且不删除任何已有 Agent

### Requirement: QQ as stable identity and tie-break
名册计票与 Agent 身份 SHALL 以 QQ 号为主键；排名并列时 SHALL 使用 QQ 号升序作为次要键。展示名可变，MUST NOT 仅因昵称变更而创建第二个 Agent。

#### Scenario: Tie-break by QQ
- **WHEN** 两名发送者文本条数相同且竞争基线末席
- **THEN** 系统按 QQ 号升序决定纳入顺序

#### Scenario: Nickname change does not duplicate
- **WHEN** 同一 QQ 的展示昵称发生变化
- **THEN** 系统仍映射到既有 Agent，不新建重复 Agent

### Requirement: Text-message counting only
发言量 SHALL 仅统计活跃归档批次中具有有效文本内容的消息条数；纯媒体或空内容 MUST NOT 计入名册票数。

#### Scenario: Image-only message ignored for roster count
- **WHEN** 归档中存在无有效文本的媒体消息
- **THEN** 该消息不增加对应 QQ 的名册计票
