## ADDED Requirements

### Requirement: Member codex profiles
系统 SHALL 提供群友图鉴，每位成员可拥有名片：显示名、头像、个性标签、擅长角色/玩法、一句话介绍与可选成就徽章。

#### Scenario: Browse member list
- **WHEN** 成员用户打开群友图鉴
- **THEN** 系统以可浏览列表或网格展示已公开的成员名片

#### Scenario: View member detail
- **WHEN** 用户打开某位群友名片
- **THEN** 系统展示其完整公开资料与已获得徽章

### Requirement: Opt-out of public profile
成员 SHALL 能够将自己的图鉴设为不公开或仅展示昵称。

#### Scenario: Hide profile
- **WHEN** 成员在设置中关闭「公开图鉴」
- **THEN** 其他用户在图鉴中无法查看其详细名片（管理员除外）
