# 绝区零主题前端

**Bar：** 首页、门禁、模块页要在五秒内读成新艾利都夜生活界面。对照 `docs/gauntlet/references.md` 与 `docs/gauntlet/bar/chinatsu-desktop.png`，以及 KUD-00 斜切面板和官网 HUD 密度。通用暗色玻璃模板算输。

**Started：** 2026-10-03
**Status：** stopped by budget — 首页标题这一条已过
**Budget：** 10 次子代理 · 已用 10 · 评审预备 0

## Routing

| Role | Model | Tier |
|---|---|---|
| Lead | 当前会话 | T3 |
| 视觉构建（首轮） | claude-fable-5-1-thinking-high | T3 |
| 评审 | claude-opus-5-thinking-high | T3 |
| 内页铺开 | claude-sonnet-5-5-high | T2 |
| 收束 | gemini-3.8-flash-high | T2 |
| 机械修改 | composer-2.5-fast | T1 |

视觉件从 T3 起。评审不用便宜模型。

## 案例

七个来源写在 `docs/gauntlet/references.md`：官网、喧响测试复刻、zzz-ui、海报工坊、都市小报、千夏角色站、NEON GRID。

## Pieces

| Piece | Rounds | Last verdict | Open gap | Spend |
|---|---|---|---|---|
| 视觉系统 + 导航 + 首页 + 门禁 | 5 | won | 无（这一条） | 10 |
| 代理人 / 画廊 / 祝福 / 活动卡片 | 0 | — | 未单独评审。全局面板样式有继承，但没有对照标杆看过这些页 | 0 |

## Round log

### 视觉系统 round 1
- Verdict: lost（评审看的是视口外的黑边）
- Gap claimed: 手机首页缩成约 200px 左栏，贴纸压住正文
- Lead check: `window.innerWidth` 390，`section.bleed` 宽 390、x=0；标题/说明条/正文包围盒不相交。`home-mobile.png` 已换成视口裁切（384×843）
- Route: 构建 fable · 评审 opus · spend 2

### 视觉系统 round 1b
- Verdict: lost
- Gap: 每个视口都是细横带浮在空背景上。桌面首页上三分之一和路面下沿是空的，版面区在跑马灯和「今日版面」之间有空白带、晚报卡片半空，手机首页顶部约 200px 空着。
- Evidence: `docs/gauntlet/shots/home-mobile.png`（384×843 视口）
- Route: 评审 claude-opus-5-thinking-high · spend 1

### 视觉系统 round 2
- Verdict: lost
- Gap: 雨伞人与吹水茶室只有约 15% 视口高，贴在底边，还被统计芯片压住。上三分之一仍是空夜空。
- Evidence: `docs/gauntlet/shots/r2-*.png`
- Route: 评审 claude-opus-5-thinking-high · spend 1

### 视觉系统 round 3
- Verdict: lost（上一缺口已关闭）
- Gap: 桌面标题断成「吹水一周 / 年」，庆典芯片压住人物的头和伞
- Evidence: `docs/gauntlet/shots/r3-*.png`
- Route: 评审 claude-fable-5-1-thinking-high · spend 1

### 视觉系统 round 4
- Verdict: lost
- Gap: 「450 / DAYS TOGETHER」芯片压进标题「年」
- Evidence: `docs/gauntlet/shots/r4-home-desktop.png`
- Route: 评审 claude-opus-5-thinking-high · spend 1

### 视觉系统 round 5
- Verdict: won
- Gap: none
- Evidence: `docs/gauntlet/shots/r5-home-desktop.png` 对照 `docs/gauntlet/bar/chinatsu-desktop.png`
- Route: 评审 claude-fable-5-1-thinking-high · spend 1
- 停止条件: 预算用尽。这一条过了，不再加轮。
