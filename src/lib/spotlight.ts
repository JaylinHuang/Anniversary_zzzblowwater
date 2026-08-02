import { daySeed, pickIndex, todayKey } from "@/lib/date-key";
import { getDb, rowsFrom } from "@/lib/db";
import { isCountableTextMessage } from "@/lib/chat-parser";

export type SpotlightSpeaker = {
  qq: string;
  displayName: string;
  textCount: number;
  sample: string | null;
};

/** 按日从活跃发言人中稳定挑一位「今日焦点」 */
export async function getDailySpotlight(
  dateKey = todayKey(),
): Promise<SpotlightSpeaker | null> {
  const db = await getDb();
  const rows = rowsFrom<{
    qq_number: string;
    sender: string;
    content: string;
  }>(
    db,
    `SELECT m.qq_number, m.sender, m.content
     FROM chat_messages m
     JOIN import_batches b ON b.id = m.batch_id
     WHERE b.status = 'active' AND m.qq_number IS NOT NULL AND m.qq_number != ''`,
  );

  const map = new Map<
    string,
    { displayName: string; textCount: number; samples: string[] }
  >();
  for (const r of rows) {
    if (!isCountableTextMessage(r.content)) continue;
    const qq = String(r.qq_number);
    const cur = map.get(qq);
    if (!cur) {
      map.set(qq, {
        displayName: r.sender,
        textCount: 1,
        samples: r.content.length <= 80 ? [r.content] : [],
      });
    } else {
      cur.textCount += 1;
      cur.displayName = r.sender;
      if (cur.samples.length < 3 && r.content.length <= 80) {
        cur.samples.push(r.content);
      }
    }
  }

  const list = [...map.entries()]
    .map(([qq, v]) => ({
      qq,
      displayName: v.displayName,
      textCount: v.textCount,
      samples: v.samples,
    }))
    .filter((x) => x.textCount >= 2)
    .sort((a, b) => a.qq.localeCompare(b.qq, "en"));

  if (!list.length) return null;
  const idx = pickIndex(daySeed(`spotlight:${dateKey}`), list.length);
  const pick = list[idx];
  const sampleIdx = pickIndex(daySeed(`sample:${dateKey}:${pick.qq}`), pick.samples.length);
  return {
    qq: pick.qq,
    displayName: pick.displayName,
    textCount: pick.textCount,
    sample: sampleIdx >= 0 ? pick.samples[sampleIdx] : null,
  };
}
