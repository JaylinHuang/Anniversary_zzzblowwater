## ADDED Requirements

### Requirement: Anniversary memory timeline
系统 SHALL 提供按时间排序的回忆时间线，节点可包含标题、日期、描述、可选配图与话题标签。

#### Scenario: Browse timeline
- **WHEN** 用户打开回忆时间线
- **THEN** 系统按时间顺序展示里程碑节点，并支持按月份或标签筛选

#### Scenario: Expand timeline node
- **WHEN** 用户展开某个时间线节点
- **THEN** 系统展示该节点详情；若已关联聊天切片，则显示关联入口或摘要

### Requirement: Moderators manage milestones
管理员或版主 SHALL 能够创建、编辑、下架时间线里程碑。

#### Scenario: Create milestone
- **WHEN** 版主提交合法的里程碑内容
- **THEN** 系统保存该节点并在时间线上对授权用户可见
