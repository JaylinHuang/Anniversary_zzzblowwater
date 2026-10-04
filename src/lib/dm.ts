import {
  agentDmDailyLimit,
  agentDriftEveryNTurns,
  GROUP_NAME,
} from "@/lib/constants";
import { countUserDmTurnsTodaySync } from "@/lib/dm-limit";
import { todayKey } from "@/lib/date-key";
import { getDb, rowFrom, rowsFrom, withDb } from "@/lib/db";
import { chatCompletion, isLlmConfigured } from "@/lib/llm";
import { formatRagBlock, retrieveRagForQq } from "@/lib/rag";
import {
  getAgentById,
  getDrift,
  maybeUpdateDrift,
} from "@/lib/roster";

export async function getOrCreateActiveSession(userId: number, agentId: number) {
  const db = await getDb();
  const existing = rowFrom<{ id: number; turn_count: number }>(
    db,
    `SELECT id, turn_count FROM agent_dm_sessions
     WHERE user_id = ? AND agent_id = ? AND active = 1
     ORDER BY id DESC LIMIT 1`,
    [userId, agentId],
  );
  if (existing) return existing;

  return withDb((db2) => {
    db2.run(
      `INSERT INTO agent_dm_sessions (user_id, agent_id, active, turn_count)
       VALUES (?, ?, 1, 0)`,
      [userId, agentId],
    );
    return rowFrom<{ id: number; turn_count: number }>(
      db2,
      `SELECT id, turn_count FROM agent_dm_sessions
       WHERE user_id = ? AND agent_id = ? AND active = 1
       ORDER BY id DESC LIMIT 1`,
      [userId, agentId],
    )!;
  });
}

export async function startNewSession(userId: number, agentId: number) {
  await withDb((db) => {
    db.run(
      `UPDATE agent_dm_sessions SET active = 0, closed_at = datetime('now')
       WHERE user_id = ? AND agent_id = ? AND active = 1`,
      [userId, agentId],
    );
  });
  // 结束旧会话时强制更新一次 Drift
  const agent = await getAgentById(agentId);
  if (agent) {
    const db = await getDb();
    const last = rowFrom<{ id: number }>(
      db,
      `SELECT id FROM agent_dm_sessions
       WHERE user_id = ? AND agent_id = ? ORDER BY id DESC LIMIT 1`,
      [userId, agentId],
    );
    if (last) {
      const lines = rowsFrom<{ role: string; content: string }>(
        db,
        `SELECT role, content FROM agent_dm_messages
         WHERE session_id = ? AND user_id = ? ORDER BY id ASC`,
        [last.id, userId],
      );
      await maybeUpdateDrift({
        userId,
        agentId,
        displayName: agent.display_name,
        sessionLines: lines,
        force: true,
        turnCount: 0,
        everyN: 1,
      });
    }
  }
  return getOrCreateActiveSession(userId, agentId);
}

export async function listSessionMessages(
  userId: number,
  sessionId: number,
) {
  const db = await getDb();
  const session = rowFrom<{ user_id: number }>(
    db,
    `SELECT user_id FROM agent_dm_sessions WHERE id = ?`,
    [sessionId],
  );
  if (!session || session.user_id !== userId) return [];
  return rowsFrom<{
    id: number;
    role: string;
    content: string;
    created_at: string;
  }>(
    db,
    `SELECT id, role, content, created_at FROM agent_dm_messages
     WHERE session_id = ? AND user_id = ? ORDER BY id ASC`,
    [sessionId, userId],
  );
}

export async function sendDm(params: {
  userId: number;
  agentId: number;
  content: string;
}) {
  const agent = await getAgentById(params.agentId);
  if (!agent) throw new Error("Agent 不存在");

  const text = params.content.trim();
  if (!text) throw new Error("消息不能为空");

  const session = await getOrCreateActiveSession(
    params.userId,
    params.agentId,
  );

  // 额度检查与落库放在同一个同步回调里，并发请求也不会越过上限
  // 严禁写入 chat_messages —— 仅 agent_dm_messages
  const limit = agentDmDailyLimit();
  const dayKey = todayKey();
  const { userMsgId, usedBefore } = await withDb((db) => {
    const used = countUserDmTurnsTodaySync(db, params.userId, dayKey);
    if (used >= limit) {
      throw new Error(`今日单聊已达上限（${limit} 轮），明天再来`);
    }
    db.run(
      `INSERT INTO agent_dm_messages (session_id, user_id, agent_id, role, content, day_key)
       VALUES (?, ?, ?, 'user', ?, ?)`,
      [session.id, params.userId, params.agentId, text, dayKey],
    );
    const idRow = rowFrom<{ id: number }>(
      db,
      `SELECT last_insert_rowid() as id`,
    );
    return { userMsgId: Number(idRow?.id), usedBefore: used };
  });
  const quota = {
    used: usedBefore,
    limit,
    remaining: Math.max(0, limit - usedBefore),
  };

  let history: Awaited<ReturnType<typeof listSessionMessages>>;
  let reply: string;
  let turnCount: number;
  try {
    ({ history, reply, turnCount } = await generateAndStoreReply());
  } catch (err) {
    // 发送失败：撤回刚写入的那句用户消息，不占额度、不留在对话里
    await withDb((db) => {
      db.run(`DELETE FROM agent_dm_messages WHERE id = ? AND user_id = ?`, [
        userMsgId,
        params.userId,
      ]);
    });
    throw err;
  }

  /** 生成回复并落库助手消息；任一步抛错都由外层撤回用户消息 */
  async function generateAndStoreReply() {
    const history = await listSessionMessages(params.userId, session.id);
    const drift =
      (await getDrift(params.userId, params.agentId))?.drift_notes || "";

    let ragBlock = "";
    try {
      const hits = await retrieveRagForQq(agent!.qq, text);
      ragBlock = formatRagBlock(hits);
    } catch {
      /* 向量检索失败时降级为纯人设对话 */
    }

    const system = [
      agent!.system_prompt,
      `你所属的群是「${GROUP_NAME}」。`,
      `你的显示名是「${agent!.display_name}」。只输出要说的话，不要带名字前缀。`,
      drift
        ? `以下是你对该用户的私有印象（Drift，仅此用户可见）：\n${drift}`
        : "",
      ragBlock,
    ]
      .filter(Boolean)
      .join("\n\n");

    let reply: string;
    if (!isLlmConfigured()) {
      reply = `（未配置大模型）以「${agent!.display_name}」口吻：收到啦——「${text.slice(0, 40)}」。配置 LLM_API_KEY 后可在 ${GROUP_NAME} 里正经对线。`;
    } else {
      reply = await chatCompletion(
        [
          { role: "system", content: system },
          ...history.slice(0, -1).slice(-16).map((h) => ({
            role: (h.role === "user" ? "user" : "assistant") as
              | "user"
              | "assistant",
            content: h.content,
          })),
          { role: "user", content: text },
        ],
        { temperature: 0.9, maxTokens: 500 },
      );
    }

    const turnCount = await withDb((db) => {
      db.run(
        `INSERT INTO agent_dm_messages (session_id, user_id, agent_id, role, content, day_key)
         VALUES (?, ?, ?, 'assistant', ?, ?)`,
        [session.id, params.userId, params.agentId, reply, dayKey],
      );
      db.run(
        `UPDATE agent_dm_sessions SET turn_count = turn_count + 1 WHERE id = ? AND user_id = ?`,
        [session.id, params.userId],
      );
      return (
        rowFrom<{ turn_count: number }>(
          db,
          `SELECT turn_count FROM agent_dm_sessions WHERE id = ?`,
          [session.id],
        )?.turn_count ?? 0
      );
    });

    return { history, reply, turnCount };
  }

  // 此时这一轮已成功落库；印象漂移只是附带更新，失败不应让前端误判为发送失败
  try {
    await maybeUpdateDrift({
      userId: params.userId,
      agentId: params.agentId,
      displayName: agent.display_name,
      sessionLines: [
        ...history.map((h) => ({ role: h.role, content: h.content })),
        { role: "assistant", content: reply },
      ],
      turnCount,
      everyN: agentDriftEveryNTurns(),
    });
  } catch {
    /* 漂移更新失败时忽略，下一轮会再尝试 */
  }

  return {
    sessionId: session.id,
    reply,
    agentName: agent.display_name,
    turnCount,
    quota: {
      used: quota.used + 1,
      limit: quota.limit,
      remaining: Math.max(0, quota.remaining - 1),
    },
  };
}
