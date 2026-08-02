## ADDED Requirements

### Requirement: Public anniversary wish wall
系统 SHALL 允许授权成员发布周年祝福，并在祝福墙上按时间或点赞展示。

#### Scenario: Post a wish
- **WHEN** 成员提交符合长度与内容规则的祝福
- **THEN** 祝福出现在祝福墙上并对其他授权用户可见

#### Scenario: Moderate wish
- **WHEN** 版主下架一条祝福
- **THEN** 该祝福对普通成员不可见

### Requirement: Time capsule messages
系统 SHALL 支持时间胶囊：成员可投递在未来日期解锁的内容；到期前仅作者与管理员可见。

#### Scenario: Seal a capsule
- **WHEN** 成员创建时间胶囊并设定解锁日期
- **THEN** 系统保存胶囊，解锁前其他成员无法阅读内容

#### Scenario: Capsule unlocks
- **WHEN** 到达解锁日期且成员打开胶囊列表
- **THEN** 系统展示该胶囊内容并标记为已解锁
