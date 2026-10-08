import { agentDmDailyLimit } from "@/lib/constants";
import { countUserDmTurnsTodaySync } from "@/lib/dm-limit";
import { todayKey } from "@/lib/date-key";
import { getDb, rowFrom, rowsFrom, withDb } from "@/lib/db";
import { runMemberTurnDetailed } from "@/lib/agent-turn";
import { getAgentById, listUserSenderNames } from "@/lib/roster";

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
  recallToken?: string;
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
  }, { persist: false });
  const quota = {
    used: usedBefore,
    limit,
    remaining: Math.max(0, limit - usedBefore),
  };

  let history: Awaited<ReturnType<typeof listSessionMessages>>;
  let reply: string;
  let turnCount: number;
  let recallToken: string | undefined;
  try {
    ({ history, reply, turnCount, recallToken } = await generateAndStoreReply());
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
    const db = await getDb();
    const speaker = rowFrom<{ display_name: string; qq_number: string | null }>(
      db,
      `SELECT display_name, qq_number FROM users WHERE id = ?`,
      [params.userId],
    );
    const userName = speaker?.display_name || `群友#${params.userId}`;
    const userQq = speaker?.qq_number?.trim() || null;
    const userAliases = await listUserSenderNames(userQq, userName);
    // 一轮多步工具回路：记忆分层和工具调用都在 agent-turn 里
    const turn = await runMemberTurnDetailed({
      agent: agent!,
      userId: params.userId,
      userName,
      userQq,
      userAliases,
      userText: text,
      history: history.slice(0, -1),
      sessionId: session.id,
      recallToken: params.recallToken,
    });
    const reply = turn.reply;

    // 用户那句还在内存里，和这句回复一起落盘，一轮只导出一次整库
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

    return { history, reply, turnCount, recallToken: turn.recallToken };
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
    recallToken: recallToken || undefined,
  };
}
