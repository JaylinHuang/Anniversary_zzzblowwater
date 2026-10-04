# 七个对照案例（构建方式与可借鉴点）

本站是《绝区零》QQ 群一周年社区，不是官网复刻。下面只借鉴结构、动效和版式手法。禁止热链或拷贝米哈游图片、立绘、商标字标和专有字体。

## 1. 官方站 zenless.hoyoverse.com

- 地址：https://zenless.hoyoverse.com/main 与 https://zenless.hoyoverse.com/branding
- 拆解来源：hacomono TECH BLOG（2024-12-14）https://techblog.hacomono.jp/entry/2024/12/14/000000
- 怎么做的：背景插画是 `<video>`，字和按钮是 HTML/CSS。特殊标题用透明底图。桌面在约 1440px 以上用根字号随视口线性缩放（`html` font-size = viewport/1440 * base），其余尺寸用 rem，让整屏像游戏 HUD 一起缩放，而不是普通流式重排。
- 借鉴：首屏要有「一块屏幕」的密度——角标、分区、强对比字，而不是居中营销标题加两团光斑。本站仍要能滚动、能用，不做锁死 1440 的游戏画布。

## 2. GMCY2020/Reprint-ZenlessZoneZero-Web

- 地址：https://github.com/GMCY2020/Reprint-ZenlessZoneZero-Web
- 在线：https://gmcy2020.github.io/Reprint-ZenlessZoneZero-Web/
- 怎么做的：Vue 3 复刻「喧响测试」。整页分 home / reserve / milestone / 新旧内容，转场用遮罩。资源是官网素材（本站不可抄）。
- 借鉴：首页下面的模块不是同质卡片网格，而是有主次、有编号、有「下一幕」的分区节奏。

## 3. KUD-00/zzz-ui

- 地址：https://github.com/KUD-00/zzz-ui
- 在线：https://zzz-ui.vercel.app
- 栈：Vite + React + Tailwind。任务/绳网信息流 UI。
- 关键 CSS（`src/index.css`）：
  - `.slanted-both`：`clip-path: polygon(10% 0, 100% 0, 90% 100%, 0% 100%)`
  - `.slanted-right` / `.slanted-left` / `.clip-background`：面板一边切斜角
  - 黄/柠檬脉冲动画标在状态点上
  - 全屏背景图 + `overflow: hidden` 的单屏信息墙（本站不要锁死滚动）
- 借鉴：斜切面板、胶带式标签、状态点。卡片不要再全是 `rounded-2xl` 玻璃方块。

## 4. sleeplessai/zzz-poster-studio

- 地址：https://github.com/sleeplessai/zzz-poster-studio
- 怎么做的：纯 HTML/CSS/JS 海报工坊。`poster_studio/css/editor.css` 约 36KB，做波普网点标题、霓虹描边字、胶囊徽章、网点投影、高斯发光、贴画图层。
- 借鉴：半调网点、描边大字、倾斜贴纸标签、黄底黑字小徽章。用在眉题、倒计时、模块编号上，不要铺满正文。

## 5. bagusindrayana/zzz-newspaper

- 地址：https://github.com/bagusindrayana/zzz-newspaper
- 怎么做的：用报纸栏版模仿游戏里的都市小报（CSS 栏、刊头、日期行）。
- 借鉴：首页「每日一句 / 记忆回声」可以像一则都市小报：刊头、日期、栏线，而不是又一张圆角面板。

## 6. mmisitan0925-afk/chinatsu-zzz

- 地址：https://github.com/mmisitan0925-afk/chinatsu-zzz
- 预览图：`docs/gauntlet/bar/chinatsu-desktop.png`（来自该仓库 `preview-desktop.png`）
- 怎么做的：单页 HTML + CSS + 原生 JS。液态玻璃（backdrop-filter + 内高光 + 噪点）、滚动错峰进入、hero 分层视差、技能卡鼠标 3D 倾斜、画廊灯箱、按钮流光。
- 借鉴：代理人卡片和模块入口的悬停应有倾斜/高光，滚动进入要错开。玻璃只能是一层，不能变成 iOS 设置页。

## 7. NEON GRID（Awwwards Masterclass）

- 地址：https://neongrid.site/
- 相关：Cyber City Orion（https://www.awwwards.com/sites/cyber-city-orion）的预加载和转场；Dopamine「Cyberpunk Redone」的 CRT 壳、扫描线、倒角 HUD。
- 怎么做的：引导日志、故障叠字、四角 HUD 括号、扫描线、区块雷达点、终端状态条。
- 借鉴：门禁页是「接入新艾利都」的一瞬间（短，可跳过，尊重 reduced-motion）。全站一层很淡的扫描线/颗粒。导航像频道条，当前项是实心斜切标签，不是细下划线。

## 本站现在的差距

- 配色已有青 `#3de0d0` / 琥珀 `#f0a35e` / 深底 `#0b1118`，但组件全是圆角玻璃，像通用暗色模板。
- 主视觉是两团径向光加一块 SVG 楼剪影。
- 导航是模糊顶栏加文字链接。
- 门禁是居中圆角表单。

## 质量杠（可并排打开）

把本站首页、门禁、代理人列表，和下面三样放在一起看：

1. `docs/gauntlet/bar/chinatsu-desktop.png` — 角色站的层次、玻璃和动势
2. KUD-00 的斜切信息流语言（见上文 CSS）
3. 官方站的「这块屏幕是都市夜生活界面」密度（视频+HUD，不要求我们上视频版权素材）

赢的标准：五秒内能看出这是新艾利都夜生活，而不是换了青橙色的通用 SaaS。正文对比度保持可读（雾色字压在深底上仍要清楚）。`prefers-reduced-motion: reduce` 时关掉循环动画。
