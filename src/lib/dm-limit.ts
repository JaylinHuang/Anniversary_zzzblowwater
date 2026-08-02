import { agentDmDailyLimit } from "@/lib/constants";
import { todayKey } from "@/lib/date-key";
import { getDb, rowFrom } from "@/lib/db";

export async function countUserDmTurnsToday(userId: number): Promise<number> {
  const db = await getDb();
  const row = rowFrom<{ c: number }>(
    db,
    `SELECT COUNT(*) as c FROM agent_dm_messages
     WHERE user_id = ? AND role = 'user'
       AND date(created_at) = date(?)`,
    [userId, todayKey()],
  );
  return Number(row?.c ?? 0);
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
