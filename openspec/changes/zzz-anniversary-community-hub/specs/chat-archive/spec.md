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

### Requirement: Manual archive import
系统 SHALL 由管理员导入 zzz-archive JSON，并保留在归档里。不提供 QQ 群机器人实时上报。每天北京时间 04:00，若有尚未跟进的新批次，系统 SHALL 重炼相关分身并重建向量。

#### Scenario: New import waits until 04:00
- **WHEN** 管理员导入一份新的群聊 JSON
- **THEN** 消息留在归档中，并在当天北京时间 04:00 之后跟进相关分身

#### Scenario: No bot webhook
- **WHEN** 请求打到已删除的机器人上报地址
- **THEN** 该地址不存在，消息不会进入归档
