## Context

仓库已有基于群聊语料的 Agent 原型（多选同台、`agent_rooms` / 导演选人），与产品意图不符。群侧约束：一年导出约 7GB（含大量媒体）、活跃约 25 人；需要可配置水位线名册、一对一单聊、私有漂移，且 **禁止手动授予 Agent**。

计票与炼丹只使用归档中的 **文本消息**；媒体不计入发言量。

## Goals / Non-Goals

**Goals:**

- 基线 Top N 建册 + 冻结 `threshold*` + 后续 `>` 准入 + 只增不删 + 软顶。
- QQ 号作为稳定主键与并列次要键；昵称仅展示。
- 单聊：用户 ↔ 单一 Agent；消息不进群归档。
- Base 人设（群语料）+ 每用户 Drift；会话消息默认只作本会话上下文。
- 基线人数、软顶等通过配置读取，便于后续修改。

**Non-Goals:**

- 管理员手动授予 / 手动创建 / 白名单塞入 Agent。
- 多 Agent 同台吹水、导演选人。
- 优先推荐「和自己的 bot 聊」。
- 把私聊内容写入或同步到群聊归档。
- 用 7GB 全量语料直接喂模型（必须抽样）。

## Decisions

### 1. 名册状态机：冻结水位 + 只增不减

- **选择**：首次成功「从语料生成名册」时：
  1. 按 `(text_count DESC, qq ASC)` 取 Top `AGENT_ROSTER_BASELINE_SIZE`（默认 25）；
  2. 将第 N 名的 `text_count` 写入 DB 为 `threshold*`（及快照元数据）；
  3. 为这 N 人创建 Agent，标记 `sealed=true`（永不因掉榜删除）。
- 之后每次语料增量（导入确认 / 机器人入库后可触发扫描）：若存在 QQ 无 Agent、`text_count > threshold*`、当前 Agent 数 `< AGENT_ROSTER_SOFT_CAP`，则自动创建。
- **备选**：实时重排 Top25（会删除掉榜者）——否决，破坏 Drift 与情感连接。

### 2. 计票口径：文本条数

- **选择**：有效文本内容的一条消息 +1；按 QQ 聚合全历史累计。
- **备选**：全类型条数（媒体刷票）；字符加权（复杂）——首期不做。
- 导出缺 QQ 号时：该条不参与名册计票（或进入「待绑定」队列），避免昵称改名分裂；实现须保证导入管线尽量解析 QQ。

### 3. 配置外置

| 键 | 默认 | 含义 |
|----|------|------|
| `AGENT_ROSTER_BASELINE_SIZE` | 25 | 基线 Top N |
| `AGENT_ROSTER_SOFT_CAP` | 40 | Agent 总数软顶 |
| `AGENT_PERSONA_SAMPLE_SIZE` | 120 | 炼 Base 时每人群聊抽样上限 |

`threshold*` **不**放 env，放 DB（首次建册写入）。

### 4. 数据模型（逻辑）

```
agent_roster_meta     → threshold*, baseline_size, locked_at, source_batch_hint
agent_personas        → qq, display_name, base_system_prompt, sealed, text_count_at_create…
agent_user_drifts     → (user_id, agent_id) → drift_notes / drift_prompt
agent_dm_sessions     → (user_id, agent_id, session_id) 当前会话
agent_dm_messages     → session 内消息；强制带 user_id；禁止写入 chat_messages
```

废弃使用：`agent_rooms` 多选语义（可停止写入；迁移期可读旧数据但不作为产品路径）。

### 5. 单聊与 Drift 时序

```
打开 /agents/[qq] → 若无进行中 session 则新建
发消息 → 上下文 = 本 session 消息 + Base + 该用户 Drift
session 结束或每 K 轮 → LLM 小结更新 Drift（仅该 user×agent）
「新会话」→ 清空/归档旧 session 消息视图，Drift 保留
```

### 6. 与群归档隔离

- 所有 DM 读写只碰 `agent_dm_*`。
- 代码路径与评审清单明确：Agent API **不得** `INSERT INTO chat_messages`。

### 7. 无手动授予

- 管理端不提供「添加 Agent / 授予 Agent」接口与 UI。
- 仅允许：建册/扫描准入、重炼已有 Agent 的 Base、开关模块等与名册规则无关的运维。

## Risks / Trade-offs

- [导出无 QQ 号] → 强化解析；无法识别者不进名册计票，避免昵称漂移双开。
- [7GB 导入性能] → 计票与抽样流式/分批；炼丹限 `AGENT_PERSONA_SAMPLE_SIZE`。
- [软顶挡住后来居上] → 软顶可配置上调；仍不提供手动授予。
- [Drift 每轮更新过贵] → 默认 session 结束或每 K 轮更新。
- [旧多 Agent 房间数据] → 停止入口；可选后续清理任务。

## Migration Plan

1. 加表与配置读取；保留旧表但不挂导航主路径。
2. 版主触发「首次建册」→ 锁定 threshold* → 生成 ≤N 个 Base。
3. 上线单聊 UI；移除多选同台 UI。
4. 增量导入/同步后跑 `scanAdmissions()`。
5. 回滚：feature flag 关闭 `member-agents`；名册数据保留无害。

## Open Questions

- 导入管线当前是否稳定解析 QQ 号？（实现时先验收解析覆盖率）
- 「新会话」按钮是否默认提供，还是仅刷新即新开？（倾向显式「新会话」）
