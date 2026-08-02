## ADDED Requirements

### Requirement: Anniversary branded home experience
系统 SHALL 提供周年主题首页，包含品牌名/站名、主视觉氛围、周年倒计时或「已同行 N 天」、以及通往核心模块的入口导航。同行天数以每年 7 月 10 日为锚点；倒计时默认指向最近庆典日（2026 年为 8 月 4 日）。

#### Scenario: Visitor opens home
- **WHEN** 用户打开站点根路径
- **THEN** 系统展示品牌级主视觉与一句群叙事文案，并显示倒计时或同行天数

#### Scenario: Navigate to modules
- **WHEN** 用户点击首页入口（如图鉴、时间线、祝福墙、玩法）
- **THEN** 系统导航至对应模块页面

### Requirement: Atmosphere without clutter in first viewport
首页首屏 SHALL 以品牌与氛围为主，避免堆叠统计卡片、日程列表等多块次要信息。

#### Scenario: First viewport content budget
- **WHEN** 用户首次进入首页（桌面或移动）
- **THEN** 首屏仅呈现品牌、主文案、简短说明、CTA 组与主导视觉，不展示次要运营信息块
