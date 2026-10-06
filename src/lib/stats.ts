import { BOT_GROUP_NAMES } from "@/lib/bot-chat";
import { GROUP_NAME } from "@/lib/constants";
import { getDb, rowsFrom, rowFrom } from "@/lib/db";
import { fillHourBuckets, isNightOwlHour, nightOwlRatio } from "@/lib/stats-rules";
import { cleanWordCloud } from "@/lib/wordcloud-clean";

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

  const nameSlots = BOT_GROUP_NAMES.map(() => "?").join(", ");
  const likeSlots = BOT_GROUP_NAMES.map(() => "m.content LIKE ?").join(" OR ");
  const nameParams = [...BOT_GROUP_NAMES];
  const likeParams = BOT_GROUP_NAMES.map((name) => `%${name}%`);
  // 机器人发的、它的 QQ 发的、以及正文里点名这些群名片的，都不进词云
  const texts = rowsFrom<{ content: string }>(
    db,
    `SELECT m.content FROM chat_messages m
     JOIN import_batches b ON b.id = m.batch_id
     WHERE b.status = 'active'
       AND m.sender NOT IN (${nameSlots})
       AND (
         m.qq_number IS NULL OR m.qq_number = '' OR m.qq_number NOT IN (
           SELECT DISTINCT qq_number FROM chat_messages
           WHERE sender IN (${nameSlots})
             AND qq_number IS NOT NULL AND qq_number != ''
         )
       )
       AND NOT (${likeSlots})
     ORDER BY m.id DESC
     LIMIT 8000`,
    [...nameParams, ...nameParams, ...likeParams],
  ).map((t) => t.content);

  const words = await cleanWordCloud(texts, GROUP_NAME, 40, [...BOT_GROUP_NAMES]);

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
    hourBuckets: fillHourBuckets(
      hours.map((h) => ({ hour: h.hour, count: Number(h.cnt) })),
    ),
    nightOwlMessages: night,
    nightOwlPercent: nightOwlRatio(night, withTime || total),
    words,
  };
}
