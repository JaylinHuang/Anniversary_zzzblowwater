## ADDED Requirements

### Requirement: Group media gallery
系统 SHALL 提供图库，支持上传图片（截图、同人、表情包等），并按专辑或标签浏览。

#### Scenario: Browse gallery
- **WHEN** 授权用户打开图库
- **THEN** 系统展示已通过审核或默认可见的媒体条目

#### Scenario: Upload media
- **WHEN** 成员上传符合大小与类型限制的图片并填写必要信息
- **THEN** 系统保存条目并按审核策略设为待审或直接可见

### Requirement: Reactions on media
系统 SHALL 允许授权用户对图库条目点赞或发表简短评论（可配置关闭评论）。

#### Scenario: Like a media item
- **WHEN** 成员对某条目点赞
- **THEN** 系统更新该条目的点赞计数且同一成员重复点赞不重复计数
