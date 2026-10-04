import { NextResponse } from "next/server";
import fs from "fs";
import path from "path";
import { requireUser } from "@/lib/auth";
import { rowFrom, withDb } from "@/lib/db";

const ALLOWED = new Set([".png", ".jpg", ".jpeg", ".gif", ".webp"]);

async function saveAvatar(file: File, userId: number) {
  if (file.size > 2 * 1024 * 1024) {
    throw new Error("头像不能超过 2MB");
  }
  const ext = path.extname(file.name || "").toLowerCase() || ".png";
  if (!ALLOWED.has(ext)) {
    throw new Error("仅支持 png / jpg / gif / webp");
  }
  const buf = Buffer.from(await file.arrayBuffer());
  const name = `avatar-${userId}-${Date.now()}${ext}`;
  const dir = path.join(process.cwd(), "data", "uploads");
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, name), buf);
  return `/uploads/${name}`;
}

export async function POST(req: Request) {
  try {
    const user = await requireUser();
    const form = await req.formData();
    const file = form.get("file");
    if (!(file instanceof File) || file.size === 0) {
      return NextResponse.json({ error: "请选择图片文件" }, { status: 400 });
    }
    const url = await saveAvatar(file, user.id);
    await withDb((db) => {
      // 尽量删掉旧头像文件（仅 avatar- 前缀）
      const prev = rowFrom<{ avatar_url: string | null }>(
        db,
        `SELECT avatar_url FROM users WHERE id = ?`,
        [user.id],
      );
      const old = prev?.avatar_url || "";
      if (old.startsWith("/uploads/avatar-")) {
        const oldPath = path.join(
          process.cwd(),
          "data",
          "uploads",
          path.basename(old),
        );
        try {
          if (fs.existsSync(oldPath)) fs.unlinkSync(oldPath);
        } catch {
          /* ignore */
        }
      }
      db.run(`UPDATE users SET avatar_url = ? WHERE id = ?`, [url, user.id]);
    });
    return NextResponse.json({ ok: true, avatarUrl: url });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "上传失败" },
      { status: 400 },
    );
  }
}
