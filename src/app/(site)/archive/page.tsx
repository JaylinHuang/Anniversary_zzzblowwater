import { PageStage } from "@/components/fx/PageStage";
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
    <PageStage
      code="HDD-03"
      channel="ARCHIVE"
      title="群聊归档"
      lede="管理员可导入 zzz-archive JSON；全站已脱敏。可检索、标记金句。"
      rail={
        topSenders.length ? (
          <div className="page-index">
            <p className="eyebrow">SENDERS</p>
            <ul>
              {topSenders.slice(0, 8).map((name) => (
                <li key={name}>
                  <a href={`/archive?q=${encodeURIComponent(name)}`}>
                    <span>{name}</span>
                    <small>按这个名字检索</small>
                  </a>
                </li>
              ))}
            </ul>
          </div>
        ) : null
      }
    >
      <ArchiveClient
        initialMessages={messages}
        batches={batches}
        canImport={isAdmin(user!.role)}
        canQuote={canModerate(user!.role)}
        initialQuery={q}
        topSenders={topSenders}
      />
    </PageStage>
  );
}
