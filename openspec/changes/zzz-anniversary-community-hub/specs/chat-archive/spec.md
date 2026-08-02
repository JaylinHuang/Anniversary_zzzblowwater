## ADDED Requirements

### Requirement: Import QQ group chat exports
系统 SHALL 允许管理员上传受支持的 QQ 群聊天导出文件，解析为结构化消息并按导入批次入库。

#### Scenario: Successful import preview
- **WHEN** 管理员上传受支持格式的导出文件
- **THEN** 系统展示解析预览（消息数量、时间范围、样例）并在确认后入库

#### Scenario: Unsupported or corrupt file
- **WHEN** 上传文件无法解析
- **THEN** 系统拒绝入库并返回可读错误说明，不产生部分脏数据批次

### Requirement: Desensitized browsing and search
系统 SHALL 对入库消息应用脱敏规则，并仅向授权角色提供检索与浏览；默认不得对外匿名公开全量原文。

#### Scenario: Member searches archive
- **WHEN** 已授权成员按关键词或日期检索群聊归档
- **THEN** 系统返回脱敏后的匹配消息列表

#### Scenario: Batch rollback
- **WHEN** 管理员撤销某一导入批次
- **THEN** 该批次消息从检索与展示中移除

### Requirement: Curated quotes from archive
系统 SHALL 支持将消息标记为「金句/梗」，供祝福墙、扭蛋、时间线等模块引用。

#### Scenario: Mark highlight quote
- **WHEN** 版主将一条归档消息标记为金句
- **THEN** 该消息进入精选池并可被其他模块引用

### Requirement: OneBot live sync webhook
系统 SHALL 提供受令牌保护的 OneBot/NapCat HTTP 上报端点；在配置了访问令牌后，可将指定群的新群聊消息脱敏写入实时归档批次。

#### Scenario: Ingest authenticated group message
- **WHEN** 机器人使用正确访问令牌向 webhook 上报一条群消息，且群号符合配置（若已配置）
- **THEN** 系统将该消息脱敏后写入活跃的实时同步批次，并可在群聊归档中检索

#### Scenario: Reject unauthorized webhook
- **WHEN** 请求未携带正确访问令牌
- **THEN** 系统拒绝入库并返回未授权错误
