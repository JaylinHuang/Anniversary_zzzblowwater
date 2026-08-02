import { getDb, rowsFrom, rowFrom } from "@/lib/db";
import {
  chineseBigramFreq,
  isNightOwlHour,
  nightOwlRatio,
} from "@/lib/stats-rules";

export async function computeFunStats(anonymous: boolean) {
  const db = await getDb();
  const talkers = rowsFrom<{ sender: string; cnt: number }>(
    db,
    `SELECT sender, COUNT(*) as cnt FROM chat_messages m
     JOIN import_batches b ON b.id = m.batch_id
     WHERE b.status = 'active'
     GROUP BY sender ORDER BY cnt DESC LIMIT 20`,
  );

  const optOut = new Set(
    rowsFrom<{ display_name: string }>(
      db,
      `SELECT display_name FROM users WHERE opt_out_leaderboard = 1`,
    ).map((r) => r.display_name),
  );

  const leaderboard = talkers.map((t, idx) => ({
    rank: idx + 1,
    name:
      anonymous || optOut.has(t.sender)
        ? `神秘绳匠 #${idx + 1}`
        : t.sender,
    count: Number(t.cnt),
  }));

  const hours = rowsFrom<{ hour: string; cnt: number }>(
    db,
    `SELECT substr(sent_at, 12, 2) as hour, COUNT(*) as cnt
     FROM chat_messages m
     JOIN import_batches b ON b.id = m.batch_id
     WHERE b.status = 'active' AND sent_at IS NOT NULL AND length(sent_at) >= 13
     GROUP BY hour ORDER BY hour`,
  );

  const night = hours
    .filter((h) => isNightOwlHour(Number(h.hour)))
    .reduce((s, h) => s + Number(h.cnt), 0);

  const texts = rowsFrom<{ content: string }>(
    db,
    `SELECT content FROM chat_messages m
     JOIN import_batches b ON b.id = m.batch_id
     WHERE b.status = 'active' LIMIT 5000`,
  ).map((t) => t.content);

  const words = chineseBigramFreq(texts, 40);

  const total = Number(
    rowFrom<{ c: number }>(
      db,
      `SELECT COUNT(*) as c FROM chat_messages m
       JOIN import_batches b ON b.id = m.batch_id WHERE b.status = 'active'`,
    )?.c ?? 0,
  );

  const withTime = hours.reduce((s, h) => s + Number(h.cnt), 0);

  return {
    totalMessages: total,
    leaderboard,
    hourBuckets: hours.map((h) => ({ hour: h.hour, count: Number(h.cnt) })),
    nightOwlMessages: night,
    nightOwlPercent: nightOwlRatio(night, withTime || total),
    words,
  };
}
