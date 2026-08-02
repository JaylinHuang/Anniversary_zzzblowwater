import { getDb, rowsFrom } from "@/lib/db";

export type MilestoneSuggestion = {
  quoteId: number;
  title: string;
  happenedOn: string | null;
  description: string;
  sender: string;
};

/** 从金句生成时光卷轴候选（不自动写入，供版主挑选） */
export async function suggestMilestonesFromQuotes(
  limit = 12,
): Promise<MilestoneSuggestion[]> {
  const db = await getDb();
  const quotes = rowsFrom<{
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
     ORDER BY m.id DESC
     LIMIT ?`,
    [limit],
  );

  return quotes.map((q) => {
    const day = q.sent_at ? q.sent_at.slice(0, 10) : null;
    const short =
      q.content.length > 36 ? `${q.content.slice(0, 36)}…` : q.content;
    return {
      quoteId: Number(q.id),
      title: `金句 · ${q.sender}`,
      happenedOn: day,
      description: short,
      sender: q.sender,
    };
  });
}
