## ADDED Requirements

### Requirement: Fun statistics from archive
系统 SHALL 基于已导入且授权使用的聊天数据生成趣味统计（如发言量、时段分布、高频词），并支持匿名化展示开关。

#### Scenario: View public fun stats
- **WHEN** 成员打开趣味统计页且管理员已启用公开统计
- **THEN** 系统展示至少一种趣味榜单或词云，且遵循当前匿名化配置

#### Scenario: Stats disabled
- **WHEN** 管理员关闭公开统计
- **THEN** 普通成员无法访问排行类统计页面

### Requirement: Member exclusion from rankings
成员 SHALL 能够选择不参与具名排行榜。

#### Scenario: Opt out of named leaderboard
- **WHEN** 成员开启「不参与具名榜单」
- **THEN** 其标识不以可识别身份出现在公开排行中
