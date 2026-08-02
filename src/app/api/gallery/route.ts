import { NextResponse } from "next/server";
import fs from "fs";
import path from "path";
import { requireModerator, requireUser } from "@/lib/auth";
import { assertModuleEnabled } from "@/lib/modules";
import { getDb, rowsFrom, withDb, rowFrom } from "@/lib/db";

export async function GET() {
  try {
    await assertModuleEnabled("media-gallery");
    await requireUser();
    const db = await getDb();
    const items = rowsFrom(
      db,
      `SELECT m.*, u.display_name FROM media_items m
       JOIN users u ON u.id = m.user_id
       WHERE m.status = 'approved'
       ORDER BY m.created_at DESC`,
    );
    return NextResponse.json({ items });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "ERROR" },
      { status: 400 },
    );
  }
}

export async function POST(req: Request) {
  try {
    await assertModuleEnabled("media-gallery");
    const user = await requireUser();
    const form = await req.formData();
    const action = String(form.get("action") || "upload");

    if (action === "upload") {
      const file = form.get("file");
      if (!(file instanceof File)) {
        return NextResponse.json({ error: "缺少文件" }, { status: 400 });
      }
      if (file.size > 5 * 1024 * 1024) {
        return NextResponse.json({ error: "文件不能超过 5MB" }, { status: 400 });
      }
      const buf = Buffer.from(await file.arrayBuffer());
      const ext = path.extname(file.name) || ".png";
      const name = `${Date.now()}-${user.id}${ext}`;
      const dir = path.join(process.cwd(), "data", "uploads");
      fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(path.join(dir, name), buf);
      const autoApprove = user.role === "admin" || user.role === "moderator";
      await withDb((db) => {
        db.run(
          `INSERT INTO media_items (user_id, title, tags, path, status)
           VALUES (?, ?, ?, ?, ?)`,
          [
            user.id,
            String(form.get("title") || file.name),
            JSON.stringify(
              String(form.get("tags") || "")
                .split(/[,，]/)
                .map((t) => t.trim())
                .filter(Boolean),
            ),
            `/uploads/${name}`,
            autoApprove ? "approved" : "pending",
          ],
        );
      });
      return NextResponse.json({ ok: true });
    }

    if (action === "like") {
      const mediaId = Number(form.get("mediaId"));
      await withDb((db) => {
        const exists = rowFrom(
          db,
          `SELECT 1 as x FROM media_likes WHERE media_id = ? AND user_id = ?`,
          [mediaId, user.id],
        );
        if (!exists) {
          db.run(`INSERT INTO media_likes (media_id, user_id) VALUES (?, ?)`, [
            mediaId,
            user.id,
          ]);
          db.run(`UPDATE media_items SET likes = likes + 1 WHERE id = ?`, [
            mediaId,
          ]);
        }
      });
      return NextResponse.json({ ok: true });
    }

    if (action === "comment") {
      await withDb((db) => {
        db.run(
          `INSERT INTO media_comments (media_id, user_id, content) VALUES (?, ?, ?)`,
          [Number(form.get("mediaId")), user.id, String(form.get("content") || "")],
        );
      });
      return NextResponse.json({ ok: true });
    }

    if (action === "approve") {
      await requireModerator();
      await withDb((db) => {
        db.run(`UPDATE media_items SET status = 'approved' WHERE id = ?`, [
          Number(form.get("mediaId")),
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
