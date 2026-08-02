import { daySeed, pickIndex, todayKey } from "@/lib/date-key";
import { getDb, rowFrom, rowsFrom } from "@/lib/db";

export type DailyQuote = {
  id: number;
  sender: string;
  content: string;
  sentAt: string | null;
  isCurated: boolean;
};

export { daySeed, pickIndex, todayKey };

/** 优先金句；没有则用长度合适的普通文本 */
export async function getDailyQuote(
  dateKey = todayKey(),
): Promise<DailyQuote | null> {
  const db = await getDb();
  let pool = rowsFrom<{
    id: number;
    sender: string;
    content: string;
    sent_at: string | null;
  }>(
    db,
    `SELECT m.id, m.sender, m.content, m.sent_at
     FROM chat_messages m
     JOIN import_batches b ON b.id = m.batch_id
     WHERE b.status = 'active' AND m.is_quote = 1
       AND length(trim(m.content)) BETWEEN 4 AND 120
     ORDER BY m.id ASC
     LIMIT 500`,
  );
  let curated = true;
  if (!pool.length) {
    curated = false;
    pool = rowsFrom(
      db,
      `SELECT m.id, m.sender, m.content, m.sent_at
       FROM chat_messages m
       JOIN import_batches b ON b.id = m.batch_id
       WHERE b.status = 'active'
         AND length(trim(m.content)) BETWEEN 8 AND 100
         AND m.content NOT LIKE '[%'
       ORDER BY m.id ASC
       LIMIT 500`,
    );
  }
  const idx = pickIndex(daySeed(dateKey), pool.length);
  if (idx < 0) return null;
  const row = pool[idx];
  return {
    id: Number(row.id),
    sender: row.sender,
    content: row.content,
    sentAt: row.sent_at,
    isCurated: curated,
  };
}

export async function countActiveQuotes(): Promise<number> {
  const db = await getDb();
  const row = rowFrom<{ c: number }>(
    db,
    `SELECT COUNT(*) as c FROM chat_messages m
     JOIN import_batches b ON b.id = m.batch_id
     WHERE b.status = 'active' AND m.is_quote = 1`,
  );
  return Number(row?.c ?? 0);
}
