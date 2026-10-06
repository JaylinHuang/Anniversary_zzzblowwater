import { GROUP_NAME } from "@/lib/constants";
import { getDb, rowFrom, rowsFrom, withDb } from "@/lib/db";
import {
  archiveJsonFromInbox,
  cleanOneBotToJson,
  flushIsDue,
  parseInboxJson,
  shanghaiDayKey,
  type InboxPayload,
} from "@/lib/live-inbox";
import type { OneBotIncoming } from "@/lib/onebot-parse";

const FLUSH_KEY = "live_flush_at";

let flushing = false;

/** 实时消息只进收件箱，不进归档。凌晨任务再灌。 */
export async function stageGroupMessage(
  payload: OneBotIncoming,
  configuredGroupId: string | null,
): Promise<{ ok: boolean; skipped?: string; id?: number }> {
  const cleaned = cleanOneBotToJson(payload, configuredGroupId);
  if ("skip" in cleaned) return { ok: true, skipped: cleaned.skip };

  const saved = await withDb((db) => {
    if (cleaned.payload.sourceMsgId) {
      const dup = rowFrom<{ id: number }>(
        db,
        `SELECT id FROM live_inbox WHERE source_msg_id = ? LIMIT 1`,
        [cleaned.payload.sourceMsgId],
      );
      if (dup) return { id: dup.id, duplicate: true };
    }
    db.run(
      `INSERT INTO live_inbox (source_msg_id, payload_json) VALUES (?, ?)`,
      [cleaned.payload.sourceMsgId, cleaned.json],
    );
    const row = rowFrom<{ id: number }>(
      db,
      `SELECT id FROM live_inbox ORDER BY id DESC LIMIT 1`,
    );
    return { id: row!.id, duplicate: false };
  });

  if (saved.duplicate) return { ok: true, skipped: "duplicate", id: saved.id };
  return { ok: true, id: saved.id };
}

export async function getInboxStatus(): Promise<{
  pending: number;
  lastFlushAt: string | null;
}> {
  const db = await getDb();
  const pending = Number(
    rowFrom<{ c: number }>(
      db,
      `SELECT COUNT(*) as c FROM live_inbox WHERE flushed_at IS NULL`,
    )?.c ?? 0,
  );
  const lastFlushAt =
    rowFrom<{ value: string }>(
      db,
      `SELECT value FROM site_settings WHERE key = ?`,
      [FLUSH_KEY],
    )?.value ?? null;
  return { pending, lastFlushAt };
}

async function rememberFlush(iso: string) {
  await withDb((db) => {
    db.run(
      `INSERT INTO site_settings (key, value) VALUES (?, ?)
       ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
      [FLUSH_KEY, iso],
    );
  });
}

/**
 * 把收件箱里的 JSON 收成一份 zzz-archive，写入归档，
 * 再刷新已绑定 Agent 的条数和向量。趣味统计直接读归档，不用另存。
 */
export async function flushLiveInbox(now = new Date()): Promise<{
  flushed: number;
  batchId: number | null;
  embedded: number;
}> {
  const db = await getDb();
  const rows = rowsFrom<{ id: number; payload_json: string }>(
    db,
    `SELECT id, payload_json FROM live_inbox
     WHERE flushed_at IS NULL
     ORDER BY id ASC`,
  );
  const staged: { id: number; payload: InboxPayload }[] = [];
  const invalidIds: number[] = [];
  for (const row of rows) {
    const payload = parseInboxJson(row.payload_json);
    if (payload) staged.push({ id: row.id, payload });
    else invalidIds.push(row.id);
  }

  if (!staged.length) {
    await rememberFlush(now.toISOString());
    if (rows.length) {
      await withDb((database) => {
        for (const row of rows) {
          database.run(
            `UPDATE live_inbox SET flushed_at = ? WHERE id = ? AND flushed_at IS NULL`,
            [now.toISOString(), row.id],
          );
        }
      });
    }
    return { flushed: 0, batchId: null, embedded: 0 };
  }

  const dayKey = shanghaiDayKey(now);
  const sourceFile = `onebot-daily-${dayKey}.json`;
  const archiveJson = archiveJsonFromInbox(
    staged.map((row) => row.payload),
    {
      groupName: GROUP_NAME,
      groupId: process.env.ONEBOT_GROUP_ID?.trim() || "",
      sourceFile,
    },
  );
  // 再过一遍归档解析，和手动导入同一扇门
  const { parseArchiveJson } = await import("@/lib/chat-json");
  const checked = parseArchiveJson(archiveJson);
  if (checked.messages.length !== staged.length) {
    throw new Error("归档 JSON 条数和收件箱不一致");
  }

  const batchId = await withDb((database) => {
    database.run(
      `INSERT INTO import_batches (filename, message_count, time_start, time_end, created_by, status)
       VALUES (?, 0, NULL, NULL, NULL, 'active')`,
      [sourceFile],
    );
    const batch = rowFrom<{ id: number }>(
      database,
      `SELECT id FROM import_batches ORDER BY id DESC LIMIT 1`,
    )!;
    const insert = database.prepare(
      `INSERT INTO chat_messages
         (batch_id, sender, qq_number, sent_at, content, content_raw, is_quote, source_msg_id)
       VALUES (?, ?, ?, ?, ?, ?, 0, ?)`,
    );
    let count = 0;
    let timeStart: string | null = null;
    let timeEnd: string | null = null;
    try {
      for (let i = 0; i < staged.length; i++) {
        const item = staged[i];
        const message = checked.messages[i];
        if (!message) continue;
        if (item.payload.sourceMsgId) {
          const dup = rowFrom<{ id: number }>(
            database,
            `SELECT id FROM chat_messages WHERE source_msg_id = ? LIMIT 1`,
            [item.payload.sourceMsgId],
          );
          if (dup) {
            database.run(
              `UPDATE live_inbox SET flushed_at = ?, batch_id = ? WHERE id = ?`,
              [now.toISOString(), batch.id, item.id],
            );
            continue;
          }
        }
        insert.run([
          batch.id,
          message.sender,
          message.qq,
          message.sentAt,
          message.content,
          message.content,
          item.payload.sourceMsgId,
        ]);
        count += 1;
        if (message.sentAt) {
          if (!timeStart || message.sentAt < timeStart) timeStart = message.sentAt;
          if (!timeEnd || message.sentAt > timeEnd) timeEnd = message.sentAt;
        }
        database.run(
          `UPDATE live_inbox SET flushed_at = ?, batch_id = ? WHERE id = ?`,
          [now.toISOString(), batch.id, item.id],
        );
      }
    } finally {
      insert.free();
    }
    database.run(
      `UPDATE import_batches
       SET message_count = ?, time_start = ?, time_end = ?
       WHERE id = ?`,
      [count, timeStart, timeEnd, batch.id],
    );
    database.run(
      `INSERT INTO site_settings (key, value) VALUES (?, ?)
       ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
      [FLUSH_KEY, now.toISOString()],
    );
    for (const id of invalidIds) {
      database.run(
        `UPDATE live_inbox SET flushed_at = ? WHERE id = ? AND flushed_at IS NULL`,
        [now.toISOString(), id],
      );
    }
    return batch.id;
  });

  const qqs = new Set(
    staged.map((row) => row.payload.qq).filter((qq): qq is string => Boolean(qq)),
  );
  try {
    const { bumpAgentSourceCount, listTrackedAgentQqs } = await import(
      "@/lib/roster"
    );
    const tracked = new Set(await listTrackedAgentQqs());
    for (const qq of qqs) {
      if (tracked.has(qq)) await bumpAgentSourceCount(qq);
    }
  } catch (error) {
    console.error(
      "[daily-flush] agent count",
      error instanceof Error ? error.message : "failed",
    );
  }

  let embedded = 0;
  try {
    const { indexEmbeddingsForQq } = await import("@/lib/rag");
    const { listTrackedAgentQqs } = await import("@/lib/roster");
    const tracked = await listTrackedAgentQqs();
    for (const qq of tracked) {
      if (!qqs.has(qq)) continue;
      const result = await indexEmbeddingsForQq(qq);
      embedded += result.indexed;
    }
  } catch (error) {
    console.error(
      "[daily-flush] embeddings",
      error instanceof Error ? error.message : "failed",
    );
  }

  return { flushed: staged.length, batchId, embedded };
}

export async function runScheduledFlush(now = new Date()): Promise<boolean> {
  if (flushing) return false;
  const { lastFlushAt } = await getInboxStatus();
  if (!flushIsDue(now, lastFlushAt)) return false;
  flushing = true;
  try {
    await flushLiveInbox(now);
    return true;
  } finally {
    flushing = false;
  }
}

/** 进程内每分钟看一次，到点或错过当天 4 点后补跑 */
export function startDailyFlushLoop() {
  const g = globalThis as { __dailyFlushLoop?: boolean };
  if (g.__dailyFlushLoop) return;
  if (process.env.NEXT_PHASE === "phase-production-build") return;
  g.__dailyFlushLoop = true;
  const tick = () => {
    void runScheduledFlush().catch((error) => {
      console.error(
        "[daily-flush]",
        error instanceof Error ? error.message : "failed",
      );
    });
  };
  const timer = setInterval(tick, 60_000);
  timer.unref?.();
  tick();
}
