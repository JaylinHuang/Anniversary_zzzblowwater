## ADDED Requirements

### Requirement: Announcements and events listing
系统 SHALL 提供活动中枢，展示公告与活动列表（标题、时间、状态、简介）。

#### Scenario: View upcoming events
- **WHEN** 用户打开活动中枢
- **THEN** 系统列出已发布的公告与活动及其状态

### Requirement: Event RSVP
系统 SHALL 允许授权成员对支持报名的活动进行报名或取消报名。

#### Scenario: RSVP to event
- **WHEN** 成员对开放报名的活动点击报名
- **THEN** 系统记录其报名状态并在活动详情中反映人数变化

### Requirement: Simple voting polls
系统 SHALL 支持管理员创建投票（单选或多选），成员可投票一次（按活动规则）。

#### Scenario: Cast vote
- **WHEN** 成员在未投票状态下提交合法选项
- **THEN** 系统记录选票并更新可见的票数统计（按活动是否公开实时结果配置）
