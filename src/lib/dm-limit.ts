import type { Database } from "sql.js";
import { agentDmDailyLimit } from "@/lib/constants";
import { todayKey } from "@/lib/date-key";
import { getDb, rowFrom } from "@/lib/db";

/** 同步统计：该用户「本地今天」已发出的用户消息条数（按 day_key，与 todayKey 同口径） */
export function countUserDmTurnsTodaySync(
  db: Database,
  userId: number,
  dayKey = todayKey(),
): number {
  const row = rowFrom<{ c: number }>(
    db,
    `SELECT COUNT(*) as c FROM agent_dm_messages
     WHERE user_id = ? AND role = 'user' AND day_key = ?`,
    [userId, dayKey],
  );
  return Number(row?.c ?? 0);
}

export async function countUserDmTurnsToday(userId: number): Promise<number> {
  const db = await getDb();
  return countUserDmTurnsTodaySync(db, userId);
}

export async function assertDmQuota(userId: number) {
  const limit = agentDmDailyLimit();
  const used = await countUserDmTurnsToday(userId);
  if (used >= limit) {
    throw new Error(`今日单聊已达上限（${limit} 轮），明天再来`);
  }
  return { used, limit, remaining: limit - used };
}

export async function getDmQuota(userId: number) {
  const limit = agentDmDailyLimit();
  const used = await countUserDmTurnsToday(userId);
  return {
    used,
    limit,
    remaining: Math.max(0, limit - used),
  };
}
