## ADDED Requirements

### Requirement: Member gacha draw
系统 SHALL 提供「群友扭蛋」：随机抽出一位公开图鉴成员，并可附带一条关联金句（若存在）。

#### Scenario: Spin gacha
- **WHEN** 成员触发扭蛋且存在至少一位可抽取的公开成员
- **THEN** 系统展示抽取结果动画或过渡效果，并显示成员名片摘要

### Requirement: Group lore quiz
系统 SHALL 支持管理员配置群梗问答题目；成员作答后获得对错反馈，答对可授予徽章（若已配置奖励）。

#### Scenario: Answer quiz correctly
- **WHEN** 成员提交正确答案
- **THEN** 系统提示正确，并在配置了徽章时授予对应徽章

### Requirement: Collaborative anniversary puzzle
系统 SHALL 提供合作拼图：授权成员可点亮尚未点亮的拼图块，共同拼出周年主视觉。

#### Scenario: Claim a puzzle piece
- **WHEN** 成员选择一块未点亮拼图且未超过当日点亮限制
- **THEN** 系统将该块标记为已点亮并记录贡献者

### Requirement: Daily fortune slip
系统 SHALL 提供每日签文/运势玩法，同一成员在同一自然日重复抽取结果保持一致。

#### Scenario: Draw daily fortune
- **WHEN** 成员在某日首次抽签
- **THEN** 系统展示一条签文；同日再次进入显示相同结果
