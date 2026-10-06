import { daySeed, pickIndex, todayKey } from "@/lib/date-key";
import { getDb, rowsFrom } from "@/lib/db";
import { isCountableTextMessage } from "@/lib/chat-parser";

export type SpotlightSpeaker = {
  qq: string;
  displayName: string;
  textCount: number;
  sample: string | null;
};

/** 同一天的焦点只算一次，避免每次打开首页都扫全表 */
const spotlightCache = new Map<string, SpotlightSpeaker | null>();

/** 按日从活跃发言人中稳定挑一位「今日焦点」 */
export async function getDailySpotlight(
  dateKey = todayKey(),
): Promise<SpotlightSpeaker | null> {
  if (spotlightCache.has(dateKey)) return spotlightCache.get(dateKey) ?? null;

  const db = await getDb();
  // 只按人计数，不把每条正文拉进内存
  const list = rowsFrom<{
    qq_number: string;
    sender: string;
    cnt: number;
  }>(
    db,
    `SELECT m.qq_number as qq_number, MAX(m.sender) as sender, COUNT(*) as cnt
     FROM chat_messages m
     JOIN import_batches b ON b.id = m.batch_id
     WHERE b.status = 'active'
       AND m.qq_number IS NOT NULL AND m.qq_number != ''
       AND length(trim(m.content)) >= 1
     GROUP BY m.qq_number
     HAVING cnt >= 2
     ORDER BY m.qq_number ASC`,
  ).map((r) => ({
    qq: String(r.qq_number),
    displayName: r.sender,
    textCount: Number(r.cnt),
  }));

  if (!list.length) {
    spotlightCache.set(dateKey, null);
    return null;
  }

  const pick = list[pickIndex(daySeed(`spotlight:${dateKey}`), list.length)];
  const samples = rowsFrom<{ content: string }>(
    db,
    `SELECT m.content as content
     FROM chat_messages m
     JOIN import_batches b ON b.id = m.batch_id
     WHERE b.status = 'active'
       AND m.qq_number = ?
       AND length(trim(m.content)) BETWEEN 1 AND 80
     ORDER BY m.id DESC
     LIMIT 40`,
    [pick.qq],
  )
    .map((r) => r.content)
    .filter((content) => isCountableTextMessage(content));

  const sampleIdx = pickIndex(
    daySeed(`sample:${dateKey}:${pick.qq}`),
    samples.length,
  );
  const value: SpotlightSpeaker = {
    qq: pick.qq,
    displayName: pick.displayName,
    textCount: pick.textCount,
    sample: sampleIdx >= 0 ? samples[sampleIdx] : null,
  };
  spotlightCache.set(dateKey, value);
  return value;
}
