import { NextResponse } from "next/server";
import {
  createSession,
  getSessionUser,
  isGateUnlocked,
} from "@/lib/auth";
import { withDb, rowFrom } from "@/lib/db";

export async function POST(req: Request) {
  try {
    if (!(await isGateUnlocked())) {
      return NextResponse.json({ error: "请先通过口令墙" }, { status: 401 });
    }

    const existing = await getSessionUser();
    if (existing) {
      return NextResponse.json({ ok: true, user: existing });
    }

    const body = await req.json().catch(() => ({}));
    const displayName = String(body.displayName || "").trim();
    if (displayName.length < 1 || displayName.length > 24) {
      return NextResponse.json({ error: "昵称长度需为 1-24" }, { status: 400 });
    }

    let userId: number;
    try {
      userId = await withDb((db) => {
        const count = rowFrom<{ c: number }>(
          db,
          `SELECT COUNT(*) as c FROM users`,
        );
        const role = (count?.c ?? 0) === 0 ? "admin" : "member";
        db.run(`INSERT INTO users (display_name, role) VALUES (?, ?)`, [
          displayName,
          role,
        ]);
        const row = rowFrom<{ id: number }>(
          db,
          `SELECT id FROM users WHERE display_name = ? ORDER BY id DESC LIMIT 1`,
          [displayName],
        );
        if (!row) throw new Error("建档写入失败");
        return row.id;
      });
    } catch (e) {
      console.error("[auth/register] db", e);
      return NextResponse.json(
        {
          error: `数据库写入失败：${e instanceof Error ? e.message : "unknown"}`,
        },
        { status: 500 },
      );
    }

    try {
      await createSession(userId);
    } catch (e) {
      console.error("[auth/register] session", e);
      return NextResponse.json(
        {
          error: `会话创建失败：${e instanceof Error ? e.message : "unknown"}`,
        },
        { status: 500 },
      );
    }

    return NextResponse.json({ ok: true, userId });
  } catch (e) {
    console.error("[auth/register]", e);
    return NextResponse.json(
      {
        error:
          e instanceof Error
            ? `建档失败：${e.message}`
            : "建档失败：服务器错误",
      },
      { status: 500 },
    );
  }
}
