import { getDb, rowFrom, withDb } from "@/lib/db";
import type { OneBotIncoming } from "@/lib/onebot-parse";

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
  const { stageGroupMessage } = await import("@/lib/daily-flush");
  return stageGroupMessage(payload, configuredGroupId());
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
