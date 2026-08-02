import { NextResponse } from "next/server";
import { requireAdmin, requireModerator, requireUser } from "@/lib/auth";
import { assertModuleEnabled } from "@/lib/modules";
import { parseQqTxt, previewStats } from "@/lib/chat-parser";
import { escapeLikePattern } from "@/lib/capsule-rules";
import { desensitize } from "@/lib/desensitize";
import { getDb, rowsFrom, withDb, rowFrom } from "@/lib/db";

export async function GET(req: Request) {
  try {
    await assertModuleEnabled("chat-archive");
    await requireUser();
    const url = new URL(req.url);
    const q = url.searchParams.get("q")?.trim() || "";
    const quotes = url.searchParams.get("quotes") === "1";
    const db = await getDb();
    let sql = `SELECT m.id, m.sender, m.sent_at, m.content, m.is_quote, m.batch_id
               FROM chat_messages m
               JOIN import_batches b ON b.id = m.batch_id
               WHERE b.status = 'active'`;
    const params: (string | number)[] = [];
    if (quotes) sql += ` AND m.is_quote = 1`;
    if (q) {
      const safe = escapeLikePattern(q);
      sql += ` AND (m.content LIKE ? ESCAPE '\\' OR m.sender LIKE ? ESCAPE '\\')`;
      params.push(`%${safe}%`, `%${safe}%`);
    }
    sql += ` ORDER BY m.sent_at DESC LIMIT 100`;
    const messages = rowsFrom(db, sql, params);
    return NextResponse.json({ messages });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "ERROR" },
      { status: 400 },
    );
  }
}

export async function POST(req: Request) {
  try {
    await assertModuleEnabled("chat-archive");
    const user = await requireAdmin();
    const body = await req.json();
    const action = String(body.action || "preview");

    if (action === "preview") {
      const raw = String(body.text || "");
      const { messages, errors } = parseQqTxt(raw);
      return NextResponse.json({
        preview: previewStats(messages),
        errors: errors.slice(0, 20),
      });
    }

    if (action === "commit") {
      const raw = String(body.text || "");
      const filename = String(body.filename || "import.txt");
      const { messages } = parseQqTxt(raw);
      if (!messages.length) {
        return NextResponse.json({ error: "没有可导入的消息" }, { status: 400 });
      }
      const stats = previewStats(messages);
      const batchId = await withDb((db) => {
        db.run(
          `INSERT INTO import_batches (filename, message_count, time_start, time_end, created_by)
           VALUES (?, ?, ?, ?, ?)`,
          [filename, stats.count, stats.timeStart, stats.timeEnd, user.id],
        );
        const batch = rowFrom<{ id: number }>(
          db,
          `SELECT id FROM import_batches ORDER BY id DESC LIMIT 1`,
        )!;
        for (const m of messages) {
          const content = desensitize(m.content);
          db.run(
            `INSERT INTO chat_messages (batch_id, sender, qq_number, sent_at, content, content_raw)
             VALUES (?, ?, ?, ?, ?, ?)`,
            [batch.id, m.sender, m.qq, m.sentAt, content, m.content],
          );
        }
        return batch.id;
      });
      // 刷新已绑定 Agent 的语料计数
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
      return NextResponse.json({
        ok: true,
        batchId,
        count: stats.count,
        withQq: stats.withQq,
      });
    }

    if (action === "rollback") {
      const batchId = Number(body.batchId);
      await withDb((db) => {
        db.run(`UPDATE import_batches SET status = 'rolled_back' WHERE id = ?`, [
          batchId,
        ]);
      });
      return NextResponse.json({ ok: true });
    }

    if (action === "quote") {
      await requireModerator();
      const id = Number(body.messageId);
      const on = body.on !== false;
      await withDb((db) => {
        db.run(`UPDATE chat_messages SET is_quote = ? WHERE id = ?`, [
          on ? 1 : 0,
          id,
        ]);
      });
      return NextResponse.json({ ok: true });
    }

    return NextResponse.json({ error: "未知操作" }, { status: 400 });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "ERROR" },
      { status: 400 },
    );
  }
}
