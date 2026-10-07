import { getDb, rowsFrom, withDb } from "@/lib/db";
import {
  FEEDBACK_BATCH_MAX,
  FEEDBACK_BODY_MAX,
  FEEDBACK_NOTE_MAX,
  type FeedbackDraft,
  type FeedbackRow,
  type FeedbackStatus,
} from "@/lib/feedback-shared";

export {
  FEEDBACK_BATCH_MAX,
  FEEDBACK_BODY_MAX,
  FEEDBACK_NOTE_MAX,
  type FeedbackDraft,
  type FeedbackRow,
  type FeedbackStatus,
} from "@/lib/feedback-shared";

const STATUSES = new Set<FeedbackStatus>(["pending", "accepted", "rejected"]);

function asStatus(raw: string): FeedbackStatus {
  return STATUSES.has(raw as FeedbackStatus) ? (raw as FeedbackStatus) : "pending";
}

/** 丢掉空行，收紧字数。一条都没有就抛错 */
export function normalizeFeedbackBatch(raw: unknown): FeedbackDraft[] {
  if (!Array.isArray(raw)) throw new Error("请按列表提交意见");
  const drafts: FeedbackDraft[] = [];
  for (const item of raw) {
    const row = item as { body?: unknown; note?: unknown };
    const body = String(row?.body ?? "").trim();
    const note = String(row?.note ?? "").trim();
    if (!body && !note) continue;
    if (!body) throw new Error("每条意见都要写正文，补充说明不能单独提交");
    if (body.length > FEEDBACK_BODY_MAX) {
      throw new Error(`意见正文最多 ${FEEDBACK_BODY_MAX} 字`);
    }
    if (note.length > FEEDBACK_NOTE_MAX) {
      throw new Error(`补充说明最多 ${FEEDBACK_NOTE_MAX} 字`);
    }
    drafts.push({ body, note });
  }
  if (!drafts.length) throw new Error("至少写一条意见");
  if (drafts.length > FEEDBACK_BATCH_MAX) {
    throw new Error(`一次最多提交 ${FEEDBACK_BATCH_MAX} 条`);
  }
  return drafts;
}

export function parseFeedbackDecision(raw: unknown): "accepted" | "rejected" {
  if (raw === "accepted" || raw === "rejected") return raw;
  throw new Error("请选择采纳或拒绝");
}

function mapRow(row: {
  id: number;
  user_id: number;
  display_name: string;
  avatar_url: string | null;
  body: string;
  note: string;
  status: string;
  created_at: string;
  resolved_at: string | null;
}): FeedbackRow {
  return {
    id: Number(row.id),
    userId: Number(row.user_id),
    displayName: String(row.display_name || "群友"),
    avatarUrl: row.avatar_url,
    body: String(row.body || ""),
    note: String(row.note || ""),
    status: asStatus(String(row.status || "")),
    createdAt: String(row.created_at || ""),
    resolvedAt: row.resolved_at ? String(row.resolved_at) : null,
  };
}

const SELECT_SQL = `
  SELECT f.id, f.user_id, u.display_name, u.avatar_url,
         f.body, f.note, f.status, f.created_at, f.resolved_at
  FROM member_feedback f
  JOIN users u ON u.id = f.user_id
`;

export async function listMyFeedback(userId: number): Promise<FeedbackRow[]> {
  const db = await getDb();
  return rowsFrom<Parameters<typeof mapRow>[0]>(
    db,
    `${SELECT_SQL} WHERE f.user_id = ? ORDER BY f.id DESC LIMIT 100`,
    [userId],
  ).map(mapRow);
}

export async function listFeedbackForAdmin(): Promise<FeedbackRow[]> {
  const db = await getDb();
  return rowsFrom<Parameters<typeof mapRow>[0]>(
    db,
    `${SELECT_SQL} ORDER BY CASE f.status WHEN 'pending' THEN 0 ELSE 1 END, f.id DESC LIMIT 200`,
  ).map(mapRow);
}

/** 同一人的一批意见一次落库 */
export async function createFeedbackBatch(userId: number, raw: unknown): Promise<number> {
  const drafts = normalizeFeedbackBatch(raw);
  await withDb((db) => {
    for (const draft of drafts) {
      db.run(
        `INSERT INTO member_feedback (user_id, body, note, status)
         VALUES (?, ?, ?, 'pending')`,
        [userId, draft.body, draft.note],
      );
    }
  });
  return drafts.length;
}

/** 管理员勾选后的采纳或拒绝。只改仍待处理的条目 */
export async function resolveFeedback(
  ids: unknown,
  decision: unknown,
): Promise<number> {
  const status = parseFeedbackDecision(decision);
  if (!Array.isArray(ids) || !ids.length) throw new Error("请先勾选意见");
  const clean = [...new Set(ids.map((id) => Number(id)).filter((id) => Number.isInteger(id) && id > 0))];
  if (!clean.length) throw new Error("请先勾选意见");
  if (clean.length > 50) throw new Error("一次最多处理 50 条");
  const slots = clean.map(() => "?").join(", ");
  await withDb((db) => {
    db.run(
      `UPDATE member_feedback
       SET status = ?, resolved_at = datetime('now')
       WHERE status = 'pending' AND id IN (${slots})`,
      [status, ...clean],
    );
  });
  return clean.length;
}
