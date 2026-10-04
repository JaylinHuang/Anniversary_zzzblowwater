import { parseQqTxt, previewStats, type ParsedMessage } from "@/lib/chat-parser";
import { parseQceXlsx } from "@/lib/chat-xlsx";
import { desensitize } from "@/lib/desensitize";
import { rowFrom, withDb } from "@/lib/db";

export type ImportPreview = ReturnType<typeof previewStats> & {
  errors: string[];
  format: "txt" | "xlsx";
};

export function previewFromTxt(raw: string): ImportPreview {
  const { messages, errors } = parseQqTxt(raw);
  return { ...previewStats(messages), errors: errors.slice(0, 20), format: "txt" };
}

export function previewFromXlsx(buffer: Buffer): ImportPreview {
  const { messages, errors } = parseQceXlsx(buffer);
  return {
    ...previewStats(messages),
    errors: errors.slice(0, 20),
    format: "xlsx",
  };
}

export function messagesFromTxt(raw: string): ParsedMessage[] {
  return parseQqTxt(raw).messages;
}

export function messagesFromXlsx(buffer: Buffer): ParsedMessage[] {
  return parseQceXlsx(buffer).messages;
}

/** 写入批次 + 消息；大文件可能较慢 */
export async function commitMessages(params: {
  messages: ParsedMessage[];
  filename: string;
  userId: number;
}): Promise<{ batchId: number; count: number; withQq: number }> {
  const { messages, filename, userId } = params;
  if (!messages.length) throw new Error("没有可导入的消息");
  const stats = previewStats(messages);
  const batchId = await withDb((db) => {
    db.run(
      `INSERT INTO import_batches (filename, message_count, time_start, time_end, created_by)
       VALUES (?, ?, ?, ?, ?)`,
      [filename, stats.count, stats.timeStart, stats.timeEnd, userId],
    );
    const batch = rowFrom<{ id: number }>(
      db,
      `SELECT id FROM import_batches ORDER BY id DESC LIMIT 1`,
    )!;
    const stmt = db.prepare(
      `INSERT INTO chat_messages (batch_id, sender, qq_number, sent_at, content, content_raw)
       VALUES (?, ?, ?, ?, ?, ?)`,
    );
    try {
      for (const m of messages) {
        const content = desensitize(m.content);
        stmt.run([batch.id, m.sender, m.qq, m.sentAt, content, m.content]);
      }
    } finally {
      stmt.free();
    }
    return batch.id;
  });

  try {
    const { listTrackedAgentQqs, bumpAgentSourceCount } = await import(
      "@/lib/roster"
    );
    const qqs = await listTrackedAgentQqs();
    for (const qq of qqs) {
      await bumpAgentSourceCount(qq);
    }
  } catch {
    /* 忽略 */
  }

  return { batchId, count: stats.count, withQq: stats.withQq };
}
