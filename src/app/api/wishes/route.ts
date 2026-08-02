import { NextResponse } from "next/server";
import { requireModerator, requireUser } from "@/lib/auth";
import { wishDailyLimit } from "@/lib/constants";
import { todayKey } from "@/lib/date-key";
import { assertModuleEnabled } from "@/lib/modules";
import { getDb, rowFrom, rowsFrom, withDb } from "@/lib/db";

export async function GET() {
  try {
    await assertModuleEnabled("wish-wall");
    await requireUser();
    const db = await getDb();
    const wishes = rowsFrom(
      db,
      `SELECT w.*, u.display_name FROM wishes w
       JOIN users u ON u.id = w.user_id
       WHERE w.hidden = 0 ORDER BY w.created_at DESC LIMIT 200`,
    );
    const capsules = rowsFrom(
      db,
      `SELECT c.id, c.unlock_on, c.created_at, u.display_name,
              CASE WHEN date(c.unlock_on) <= date('now') THEN c.content ELSE NULL END as content,
              CASE WHEN date(c.unlock_on) <= date('now') THEN 1 ELSE 0 END as unlocked
       FROM capsules c JOIN users u ON u.id = c.user_id
       ORDER BY c.unlock_on ASC`,
    );
    return NextResponse.json({ wishes, capsules });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "ERROR" },
      { status: 400 },
    );
  }
}

export async function POST(req: Request) {
  try {
    await assertModuleEnabled("wish-wall");
    const user = await requireUser();
    const body = await req.json();
    const kind = String(body.kind || "wish");
    if (kind === "wish") {
      const content = String(body.content || "").trim();
      if (content.length < 1 || content.length > 500) {
        return NextResponse.json({ error: "祝福长度 1-500" }, { status: 400 });
      }
      const limit = wishDailyLimit();
      const db = await getDb();
      const used = Number(
        rowFrom<{ c: number }>(
          db,
          `SELECT COUNT(*) as c FROM wishes
           WHERE user_id = ? AND date(created_at) = date(?)`,
          [user.id, todayKey()],
        )?.c ?? 0,
      );
      if (used >= limit) {
        return NextResponse.json(
          { error: `今日祝福已达上限（${limit} 条）` },
          { status: 400 },
        );
      }
      await withDb((db2) => {
        db2.run(`INSERT INTO wishes (user_id, content) VALUES (?, ?)`, [
          user.id,
          content,
        ]);
      });
      return NextResponse.json({ ok: true, remaining: limit - used - 1 });
    }
    if (kind === "capsule") {
      const content = String(body.content || "").trim();
      const unlockOn = String(body.unlockOn || "");
      if (!content || !unlockOn) {
        return NextResponse.json({ error: "缺少内容或解锁日" }, { status: 400 });
      }
      await withDb((db) => {
        db.run(
          `INSERT INTO capsules (user_id, content, unlock_on) VALUES (?, ?, ?)`,
          [user.id, content, unlockOn],
        );
      });
      return NextResponse.json({ ok: true });
    }
    if (kind === "hide") {
      await requireModerator();
      await withDb((db) => {
        db.run(`UPDATE wishes SET hidden = 1 WHERE id = ?`, [
          Number(body.id),
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
