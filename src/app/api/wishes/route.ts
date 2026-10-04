import { NextResponse } from "next/server";
import { requireModerator, requireUser } from "@/lib/auth";
import { wishDailyLimit } from "@/lib/constants";
import {
  COUNT_WISHES_TODAY_SQL,
  INSERT_WISH_IF_UNDER_LIMIT_SQL,
  localDayRangeUtc,
  wishRemaining,
} from "@/lib/wish-rules";
import {
  capsuleViewerParams,
  parseCapsuleUnlockOn,
  SELECT_CAPSULES_FOR_VIEWER_SQL,
} from "@/lib/capsule-rules";
import { assertModuleEnabled } from "@/lib/modules";
import { getDb, rowFrom, rowsFrom, withDb } from "@/lib/db";

export async function GET() {
  try {
    await assertModuleEnabled("wish-wall");
    const user = await requireUser();
    const db = await getDb();
    const wishes = rowsFrom(
      db,
      `SELECT w.*, u.display_name FROM wishes w
       JOIN users u ON u.id = w.user_id
       WHERE w.hidden = 0 ORDER BY w.created_at DESC LIMIT 200`,
    );
    // 未解锁胶囊的正文仅对作者本人下发，其他人为 null
    const capsules = rowsFrom(db, SELECT_CAPSULES_FOR_VIEWER_SQL,
      capsuleViewerParams(user.id),
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
      const { start, end } = localDayRangeUtc();
      // 条数检查与写入在同一条 SQL 里完成；sql.js 同步执行，中间不会被其他请求插队
      const result = await withDb((db) => {
        db.run(INSERT_WISH_IF_UNDER_LIMIT_SQL, [
          user.id,
          content,
          user.id,
          start,
          end,
          limit,
        ]);
        const inserted = db.getRowsModified() === 1;
        const used = Number(
          rowFrom<{ c: number }>(db, COUNT_WISHES_TODAY_SQL, [
            user.id,
            start,
            end,
          ])?.c ?? 0,
        );
        return { inserted, used };
      });
      if (!result.inserted) {
        return NextResponse.json(
          { error: `今日祝福已达上限（${limit} 条）`, remaining: 0, limit },
          { status: 429 },
        );
      }
      return NextResponse.json({
        ok: true,
        remaining: wishRemaining(limit, result.used),
        limit,
      });
    }
    if (kind === "capsule") {
      const content = String(body.content || "").trim();
      if (!content) {
        return NextResponse.json({ error: "缺少内容或解锁日" }, { status: 400 });
      }
      // 写入前先校验解锁日必须是合法的 YYYY-MM-DD，非法则直接拒绝
      const unlockOn = parseCapsuleUnlockOn(body.unlockOn);
      if (!unlockOn) {
        return NextResponse.json(
          { error: "解锁日格式必须是 YYYY-MM-DD" },
          { status: 400 },
        );
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
