import { daySeed, pickIndex, todayKey } from "@/lib/date-key";
import { getDb, rowsFrom } from "@/lib/db";

export type MemoryEcho = {
  id: number;
  sender: string;
  content: string;
  sentAt: string | null;
  label: string;
};

/** 从归档抽一条「记忆回响」；salt 用于换一句 */
export async function getMemoryEcho(opts?: {
  dateKey?: string;
  salt?: number;
}): Promise<MemoryEcho | null> {
  const dateKey = opts?.dateKey ?? todayKey();
  const salt = opts?.salt ?? 0;
  const db = await getDb();
  const pool = rowsFrom<{
    id: number;
    sender: string;
    content: string;
    sent_at: string | null;
    is_quote: number;
  }>(
    db,
    `SELECT m.id, m.sender, m.content, m.sent_at, m.is_quote
     FROM chat_messages m
     JOIN import_batches b ON b.id = m.batch_id
     WHERE b.status = 'active'
       AND length(trim(m.content)) BETWEEN 6 AND 140
       AND m.content NOT LIKE '[%'
     ORDER BY m.id ASC
     LIMIT 800`,
  );
  if (!pool.length) return null;
  const idx = pickIndex(daySeed(`${dateKey}#${salt}`), pool.length);
  const row = pool[idx];
  return {
    id: Number(row.id),
    sender: row.sender,
    content: row.content,
    sentAt: row.sent_at,
    label: row.is_quote ? "金句回响" : "记忆回响",
  };
}
