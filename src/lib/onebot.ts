import { desensitize } from "@/lib/desensitize";
import { getDb, rowFrom, withDb } from "@/lib/db";
import {
  extractPlainText,
  formatSender,
  formatSentAt,
  shouldAcceptGroup,
  type OneBotIncoming,
} from "@/lib/onebot-parse";

export type { OneBotIncoming };
export {
  extractPlainText,
  formatSender,
  formatSentAt,
  shouldAcceptGroup,
} from "@/lib/onebot-parse";

export function configuredGroupId(): string | null {
  const v = process.env.ONEBOT_GROUP_ID?.trim();
  return v || null;
}

export function verifyOneBotToken(req: Request): boolean {
  const expected = process.env.ONEBOT_ACCESS_TOKEN?.trim();
  if (!expected) return false;

  const auth = req.headers.get("authorization") || "";
  if (auth.toLowerCase().startsWith("bearer ")) {
    if (auth.slice(7).trim() === expected) return true;
  }
  const headerToken =
    req.headers.get("x-onebot-token") ||
    req.headers.get("x-access-token") ||
    "";
  if (headerToken === expected) return true;

  const url = new URL(req.url);
  if (url.searchParams.get("access_token") === expected) return true;
  return false;
}

export function isOneBotConfigured() {
  return Boolean(process.env.ONEBOT_ACCESS_TOKEN?.trim());
}

/** 确保存在活跃的实时同步批次，返回 batch_id */
export async function ensureLiveBatch(): Promise<number> {
  return withDb((db) => {
    const existing = rowFrom<{ id: number }>(
      db,
      `SELECT id FROM import_batches WHERE filename = 'onebot-live' AND status = 'active' LIMIT 1`,
    );
    if (existing) return existing.id;
    db.run(
      `INSERT INTO import_batches (filename, message_count, time_start, time_end, created_by, status)
       VALUES ('onebot-live', 0, NULL, NULL, NULL, 'active')`,
    );
    const row = rowFrom<{ id: number }>(
      db,
      `SELECT id FROM import_batches WHERE filename = 'onebot-live' ORDER BY id DESC LIMIT 1`,
    );
    return row!.id;
  });
}

export async function ingestGroupMessage(payload: OneBotIncoming): Promise<{
  ok: boolean;
  skipped?: string;
  id?: number;
}> {
  if (payload.post_type !== "message" || payload.message_type !== "group") {
    return { ok: true, skipped: "not_group_message" };
  }

  const allowedGroup = configuredGroupId();
  if (!shouldAcceptGroup(payload.group_id, allowedGroup)) {
    return { ok: true, skipped: "group_mismatch" };
  }

  const raw = extractPlainText(payload).trim();
  if (!raw) return { ok: true, skipped: "empty" };

  const sourceMsgId =
    payload.message_id != null ? String(payload.message_id) : null;
  const sender = formatSender(payload);
  const sentAt = formatSentAt(payload.time);
  const content = desensitize(raw);
  const batchId = await ensureLiveBatch();
  const qq =
    payload.user_id != null && String(payload.user_id).match(/^\d{5,}$/)
      ? String(payload.user_id)
      : null;

  const id = await withDb((db) => {
    if (sourceMsgId) {
      const dup = rowFrom<{ id: number }>(
        db,
        `SELECT id FROM chat_messages WHERE source_msg_id = ? LIMIT 1`,
        [sourceMsgId],
      );
      if (dup) return dup.id;
    }
    db.run(
      `INSERT INTO chat_messages (batch_id, sender, qq_number, sent_at, content, content_raw, is_quote, source_msg_id)
       VALUES (?, ?, ?, ?, ?, ?, 0, ?)`,
      [batchId, sender, qq, sentAt, content, raw, sourceMsgId],
    );
    db.run(
      `UPDATE import_batches
       SET message_count = message_count + 1,
           time_start = COALESCE(time_start, ?),
           time_end = ?
       WHERE id = ?`,
      [sentAt, sentAt, batchId],
    );
    const row = rowFrom<{ id: number }>(
      db,
      `SELECT id FROM chat_messages ORDER BY id DESC LIMIT 1`,
    );
    return row!.id;
  });

  // 若该 QQ 已绑定 Agent，刷新其实时语料计数
  if (qq) {
    try {
      const { bumpAgentSourceCount } = await import("@/lib/roster");
      await bumpAgentSourceCount(qq);
    } catch {
      /* 忽略 */
    }
  }

  return { ok: true, id };
}

export async function getLiveSyncStatus() {
  const db = await getDb();
  const batch = rowFrom<{
    id: number;
    message_count: number;
    time_start: string | null;
    time_end: string | null;
    status: string;
  }>(
    db,
    `SELECT id, message_count, time_start, time_end, status
     FROM import_batches WHERE filename = 'onebot-live' ORDER BY id DESC LIMIT 1`,
  );
  return {
    configured: isOneBotConfigured(),
    groupId: configuredGroupId(),
    batch,
  };
}
