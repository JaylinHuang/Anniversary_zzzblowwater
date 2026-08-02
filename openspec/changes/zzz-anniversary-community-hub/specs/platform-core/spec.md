## ADDED Requirements

### Requirement: Invite-gated membership
系统 SHALL 通过**整站群口令墙**控制访问；未通过口令的访客不得访问内容页。通过口令后须建立站内昵称会话；首个建档用户 SHALL 获得 `admin` 角色，其后为 `member`。

#### Scenario: Join with valid passphrase
- **WHEN** 用户输入正确群口令并提交昵称
- **THEN** 系统解锁站点、创建成员会话并授予相应角色

#### Scenario: Reject invalid passphrase
- **WHEN** 用户使用错误口令
- **THEN** 系统拒绝解锁并提示错误

### Requirement: Role-based access control
系统 SHALL 支持至少 `guest`、`member`、`moderator`、`admin` 角色，并按角色限制管理与写入操作。

#### Scenario: Admin-only import
- **WHEN** 非管理员尝试访问聊天导入功能
- **THEN** 系统拒绝该操作

### Requirement: Feature modules can be toggled
系统 SHALL 支持按模块开关功能（如趣味统计、扭蛋、图库），关闭后入口对普通用户不可用。

#### Scenario: Disable a module
- **WHEN** 管理员关闭某一功能模块
- **THEN** 普通成员无法从导航进入该模块页面

### Requirement: Extensible module slots
系统架构 SHALL 允许后续以独立模块方式新增玩法或活动类型，而不要求重写核心认证与成员系统。

#### Scenario: New module registration
- **WHEN** 开发者按约定注册一个新的功能模块并启用
- **THEN** 该模块出现在导航或活动入口中且复用现有身份权限
