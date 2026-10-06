import { NextResponse } from "next/server";
import { requireAdmin, requireModerator, requireUser } from "@/lib/auth";
import { assertModuleEnabled } from "@/lib/modules";
import {
  commitMessages,
  messagesFromJson,
  previewFromJson,
} from "@/lib/archive-import";
import { escapeLikePattern } from "@/lib/capsule-rules";
import { getDb, rowsFrom, withDb } from "@/lib/db";

export const maxDuration = 300;
export const dynamic = "force-dynamic";

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

/** 只接受 zzz-archive JSON，拒绝 xlsx / TXT */
function readArchiveJson(
  fileBuf?: Buffer,
  fileName?: string,
  text?: string,
): string {
  if (fileBuf) {
    const name = (fileName || "").toLowerCase();
    if (name && !name.endsWith(".json")) {
      throw new Error("请上传 zzz-archive JSON 文件");
    }
    return fileBuf.toString("utf8");
  }
  if (text?.trim()) return text;
  throw new Error("请上传 zzz-archive JSON 文件");
}

async function parseBody(req: Request): Promise<{
  action: string;
  text?: string;
  filename?: string;
  batchId?: number;
  messageId?: number;
  on?: boolean;
  fileBuf?: Buffer;
  fileName?: string;
}> {
  const ctype = req.headers.get("content-type") || "";
  if (ctype.includes("multipart/form-data")) {
    const form = await req.formData();
    const action = String(form.get("action") || "preview");
    const file = form.get("file");
    let fileBuf: Buffer | undefined;
    let fileName: string | undefined;
    if (file instanceof File && file.size > 0) {
      fileBuf = Buffer.from(await file.arrayBuffer());
      fileName = file.name || "import.json";
    }
    return {
      action,
      text: form.get("text") != null ? String(form.get("text")) : undefined,
      filename:
        form.get("filename") != null
          ? String(form.get("filename"))
          : fileName,
      batchId: form.get("batchId") != null ? Number(form.get("batchId")) : undefined,
      messageId:
        form.get("messageId") != null
          ? Number(form.get("messageId"))
          : undefined,
      on: form.get("on") != null ? form.get("on") !== "false" : undefined,
      fileBuf,
      fileName,
    };
  }
  const body = await req.json().catch(() => ({}));
  return {
    action: String(body.action || "preview"),
    text: body.text != null ? String(body.text) : undefined,
    filename: body.filename != null ? String(body.filename) : undefined,
    batchId: body.batchId != null ? Number(body.batchId) : undefined,
    messageId: body.messageId != null ? Number(body.messageId) : undefined,
    on: body.on,
  };
}

export async function POST(req: Request) {
  try {
    await assertModuleEnabled("chat-archive");
    const user = await requireAdmin();
    const body = await parseBody(req);
    const action = body.action;

    if (action === "preview") {
      const raw = readArchiveJson(body.fileBuf, body.fileName, body.text);
      const full = previewFromJson(raw);
      const { sample: _sample, ...preview } = full;
      return NextResponse.json({
        preview,
        errors: preview.errors,
      });
    }

    if (action === "commit") {
      const raw = readArchiveJson(body.fileBuf, body.fileName, body.text);
      const messages = messagesFromJson(raw);
      const filename = body.fileName || body.filename || "archive.json";
      const result = await commitMessages({
        messages,
        filename,
        userId: user.id,
      });
      return NextResponse.json({ ok: true, ...result });
    }

    if (action === "rollback") {
      const batchId = Number(body.batchId);
      await withDb((db) => {
        db.run(`UPDATE import_batches SET status = 'rolled_back' WHERE id = ?`, [
          batchId,
        ]);
        // 软删对应向量，避免检索到已撤销批次
        db.run(
          `DELETE FROM chat_embeddings
           WHERE message_id IN (
             SELECT id FROM chat_messages WHERE batch_id = ?
           )`,
          [batchId],
        );
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
