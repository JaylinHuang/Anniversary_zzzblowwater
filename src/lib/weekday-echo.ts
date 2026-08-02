import { getDb, rowsFrom } from "@/lib/db";
import { todayKey, weekdayIndex } from "@/lib/date-key";

export { weekdayIndex };

export type WeekdayEcho = {
  id: number;
  sender: string;
  content: string;
  sentAt: string | null;
  weekday: number;
};

/** 抽取「历史上的同一星期几」发言，做周年怀旧 */
export async function getWeekdayEchoes(
  dateKey = todayKey(),
  limit = 8,
): Promise<WeekdayEcho[]> {
  const wd = weekdayIndex(dateKey);
  const db = await getDb();
  // sql.js/SQLite：strftime('%w', sent_at) 需可解析日期
  const rows = rowsFrom<{
    id: number;
    sender: string;
    content: string;
    sent_at: string | null;
  }>(
    db,
    `SELECT m.id, m.sender, m.content, m.sent_at
     FROM chat_messages m
     JOIN import_batches b ON b.id = m.batch_id
     WHERE b.status = 'active'
       AND m.sent_at IS NOT NULL
       AND length(m.sent_at) >= 10
       AND length(trim(m.content)) BETWEEN 6 AND 120
       AND m.content NOT LIKE '[%'
       AND cast(strftime('%w', replace(substr(m.sent_at,1,10), '/', '-')) as integer) = ?
     ORDER BY m.id DESC
     LIMIT ?`,
    [wd, limit],
  );
  return rows.map((r) => ({
    id: Number(r.id),
    sender: r.sender,
    content: r.content,
    sentAt: r.sent_at,
    weekday: wd,
  }));
}
