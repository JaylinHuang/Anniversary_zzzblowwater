import { assertModuleEnabled } from "@/lib/modules";
import { getDb, rowsFrom } from "@/lib/db";
import { getSessionUser, isAdmin, canModerate } from "@/lib/auth";
import { escapeLikePattern } from "@/lib/capsule-rules";
import { ArchiveClient } from "./ArchiveClient";

export default async function ArchivePage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  await assertModuleEnabled("chat-archive");
  const sp = await searchParams;
  const user = await getSessionUser();
  const db = await getDb();
  const q = sp.q?.trim() || "";
  let sql = `SELECT m.id, m.sender, m.sent_at, m.content, m.is_quote
             FROM chat_messages m
             JOIN import_batches b ON b.id = m.batch_id
             WHERE b.status = 'active'`;
  const params: string[] = [];
  if (q) {
    const safe = escapeLikePattern(q);
    sql += ` AND (m.content LIKE ? ESCAPE '\\' OR m.sender LIKE ? ESCAPE '\\')`;
    params.push(`%${safe}%`, `%${safe}%`);
  }
  sql += ` ORDER BY m.sent_at DESC LIMIT 80`;
  const messages = rowsFrom<{
    id: number;
    sender: string;
    sent_at: string | null;
    content: string;
    is_quote: number;
  }>(db, sql, params);

  const topSenders = rowsFrom<{ sender: string; c: number }>(
    db,
    `SELECT m.sender, COUNT(*) as c FROM chat_messages m
     JOIN import_batches b ON b.id = m.batch_id
     WHERE b.status = 'active'
     GROUP BY m.sender ORDER BY c DESC LIMIT 12`,
  ).map((r) => r.sender);

  const batches = isAdmin(user!.role)
    ? rowsFrom<{
        id: number;
        filename: string;
        message_count: number;
        status: string;
        time_start: string | null;
        time_end: string | null;
      }>(
        db,
        `SELECT id, filename, message_count, status, time_start, time_end FROM import_batches ORDER BY id DESC`,
      )
    : [];

  return (
    <div>
      <h1 className="brand-font text-3xl text-[var(--cyan)]">群聊归档</h1>
      <p className="mt-2 text-sm text-[var(--fog)]">
        管理员导入 QQ 导出 TXT；全站已脱敏。可检索、标记金句。
      </p>
      <ArchiveClient
        initialMessages={messages}
        batches={batches}
        canImport={isAdmin(user!.role)}
        canQuote={canModerate(user!.role)}
        initialQuery={q}
        topSenders={topSenders}
      />
    </div>
  );
}
