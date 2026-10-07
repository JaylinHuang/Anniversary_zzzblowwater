import type { Database } from "sql.js";
import { rowsFrom } from "@/lib/db";

/**
 * 这一行要不要留下。rn、total 从 1 计。
 * 条数少于段数时几乎每行都会留下；条数很多时按时间均匀留一段，末尾再强制留下。
 */
export function shouldKeepSpreadRow(
  rn: number,
  total: number,
  buckets: number,
  recentTail: number,
): boolean {
  if (total <= 0 || rn < 1 || rn > total) return false;
  if (rn === 1 || rn > total - recentTail) return true;
  const span = Math.max(1, Math.floor(buckets));
  const bucket = (index: number) => Math.floor((index * span) / total);
  return bucket(rn - 1) !== bucket(Math.max(0, rn - 2));
}

/** 按时间顺序的 id 里均匀抽。只处理编号，不碰正文 */
export function pickSpreadIds(
  ids: number[],
  buckets: number,
  recentTail: number,
): number[] {
  const total = ids.length;
  const kept: number[] = [];
  for (let i = 0; i < total; i++) {
    if (shouldKeepSpreadRow(i + 1, total, buckets, recentTail)) {
      kept.push(ids[i]);
    }
  }
  return kept;
}

export type SpreadMessage = {
  id: number;
  content: string;
  sent_at: string | null;
};

/**
 * 抽出某人全年发言里的一小段。先只读消息编号，再按编号取正文，避免把全部发言载入内存。
 */
export function loadSpreadMessages(
  db: Database,
  qq: string,
  buckets: number,
  recentTail: number,
): SpreadMessage[] {
  const ids = pickSpreadIds(
    rowsFrom<{ id: number }>(
      db,
      `SELECT m.id AS id
       FROM chat_messages m
       JOIN import_batches b ON b.id = m.batch_id
       WHERE b.status = 'active' AND m.qq_number = ?
       ORDER BY m.id`,
      [qq],
    ).map((row) => Number(row.id)),
    buckets,
    recentTail,
  );
  if (!ids.length) return [];
  const slots = ids.map(() => "?").join(", ");
  return rowsFrom<{ id: number; content: string; sent_at: string | null }>(
    db,
    `SELECT id, content, sent_at
     FROM chat_messages
     WHERE id IN (${slots})
     ORDER BY id`,
    ids,
  ).map((row) => ({
    id: Number(row.id),
    content: String(row.content ?? ""),
    sent_at: row.sent_at == null ? null : String(row.sent_at),
  }));
}
