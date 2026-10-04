import { NextResponse } from "next/server";
import { requireAdmin, requireModerator, requireUser } from "@/lib/auth";
import { assertModuleEnabled } from "@/lib/modules";
import { getDb, rowsFrom, withDb, rowFrom } from "@/lib/db";
import { isPollOpen } from "@/lib/poll-rules";
import { canToggleRsvp, isEventStatus } from "@/lib/events-rules";

export async function GET(req: Request) {
  try {
    await assertModuleEnabled("events-hub");
    const user = await requireUser();
    const url = new URL(req.url);
    const adminDetail = url.searchParams.get("adminDetail") === "1";

    if (adminDetail) {
      await requireAdmin();
      const db = await getDb();
      const polls = rowsFrom<{
        id: number;
        question: string;
        options: string;
        show_live: number;
        ends_at: string | null;
      }>(db, `SELECT * FROM polls ORDER BY id DESC`);
      const detailed = polls.map((p) => {
        const options = JSON.parse(String(p.options || "[]")) as string[];
        const votes = rowsFrom<{
          display_name: string;
          option_index: number;
          user_id: number;
        }>(
          db,
          `SELECT u.display_name, u.id as user_id, v.option_index
           FROM poll_votes v
           JOIN users u ON u.id = v.user_id
           WHERE v.poll_id = ?
           ORDER BY v.option_index, u.display_name`,
          [p.id],
        );
        const tallies = options.map(
          (_, idx) => votes.filter((v) => v.option_index === idx).length,
        );
        return {
          id: p.id,
          question: p.question,
          options,
          endsAt: p.ends_at,
          open: isPollOpen(p.ends_at),
          showLive: !!p.show_live,
          tallies,
          total: votes.length,
          ballots: votes.map((v) => ({
            userId: v.user_id,
            displayName: v.display_name,
            optionIndex: v.option_index,
            optionLabel: options[v.option_index] ?? `选项${v.option_index}`,
          })),
        };
      });
      return NextResponse.json({ polls: detailed });
    }

    const db = await getDb();
    // 附带当前用户是否已报名（my_rsvp：1/0）
    const events = rowsFrom(
      db,
      `SELECT e.*,
        (SELECT COUNT(*) FROM event_rsvps r WHERE r.event_id = e.id) as rsvp_count,
        (SELECT COUNT(*) FROM event_rsvps m WHERE m.event_id = e.id AND m.user_id = ?) as my_rsvp
       FROM events e WHERE e.published = 1 ORDER BY e.created_at DESC`,
      [user.id],
    );
    const polls = rowsFrom(db, `SELECT * FROM polls ORDER BY id DESC`).map(
      (p) => {
        const options = JSON.parse(String(p.options || "[]")) as string[];
        const votes = rowsFrom<{ option_index: number; c: number }>(
          db,
          `SELECT option_index, COUNT(*) as c FROM poll_votes WHERE poll_id = ? GROUP BY option_index`,
          [p.id as number],
        );
        // 当前用户在该投票中选的选项下标，未投为 null
        const mine = rowFrom<{ option_index: number }>(
          db,
          `SELECT option_index FROM poll_votes WHERE poll_id = ? AND user_id = ?`,
          [p.id as number, user.id],
        );
        return {
          ...p,
          options,
          myVote: mine ? Number(mine.option_index) : null,
          tallies: options.map(
            (_, idx) => votes.find((v) => v.option_index === idx)?.c ?? 0,
          ),
        };
      },
    );
    return NextResponse.json({ events, polls });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "ERROR" },
      { status: 400 },
    );
  }
}

export async function POST(req: Request) {
  try {
    await assertModuleEnabled("events-hub");
    const user = await requireUser();
    const body = await req.json();
    const action = String(body.action || "");

    if (action === "create") {
      await requireModerator();
      await withDb((db) => {
        db.run(
          `INSERT INTO events (title, kind, description, starts_at, status)
           VALUES (?, ?, ?, ?, ?)`,
          [
            String(body.title || ""),
            String(body.kind || "event"),
            String(body.description || ""),
            body.startsAt || null,
            "open",
          ],
        );
      });
      return NextResponse.json({ ok: true });
    }

    // 版主/管理员开关报名：只改 events.status，不动已有报名记录
    if (action === "set-status") {
      await requireModerator();
      const eventId = Number(body.eventId);
      if (!isEventStatus(body.status)) {
        return NextResponse.json({ error: "无效的活动状态" }, { status: 400 });
      }
      const db = await getDb();
      const target = rowFrom(
        db,
        `SELECT 1 as x FROM events WHERE id = ? AND published = 1`,
        [eventId],
      );
      if (!target) {
        return NextResponse.json({ error: "活动不存在" }, { status: 404 });
      }
      await withDb((d) => {
        d.run(`UPDATE events SET status = ? WHERE id = ?`, [
          body.status,
          eventId,
        ]);
      });
      return NextResponse.json({ ok: true, status: body.status });
    }

    if (action === "rsvp") {
      const eventId = Number(body.eventId);
      // 状态读取、是否已报名判断、删除/插入全部在同一个同步的 withDb 回调内完成，
      // 回调中间没有 await，同一进程内的并发请求无法在检查与写入之间插队
      const result = await withDb((db) => {
        const ev = rowFrom<{ status: string }>(
          db,
          `SELECT status FROM events WHERE id = ? AND published = 1`,
          [eventId],
        );
        if (!ev) return "not-found" as const;
        const exists = !!rowFrom(
          db,
          `SELECT 1 as x FROM event_rsvps WHERE event_id = ? AND user_id = ?`,
          [eventId, user.id],
        );
        // 已报名者始终可取消；未报名者在已关闭时不能新报名（以写入当时的状态为准）
        if (!canToggleRsvp(exists, String(ev.status))) return "closed" as const;
        if (exists) {
          db.run(`DELETE FROM event_rsvps WHERE event_id = ? AND user_id = ?`, [
            eventId,
            user.id,
          ]);
        } else {
          db.run(`INSERT INTO event_rsvps (event_id, user_id) VALUES (?, ?)`, [
            eventId,
            user.id,
          ]);
        }
        return "ok" as const;
      });
      if (result === "not-found") {
        return NextResponse.json({ error: "活动不存在" }, { status: 404 });
      }
      if (result === "closed") {
        return NextResponse.json({ error: "已关闭报名" }, { status: 400 });
      }
      return NextResponse.json({ ok: true });
    }

    if (action === "poll-create") {
      await requireModerator();
      await withDb((db) => {
        db.run(
          `INSERT INTO polls (event_id, question, options, show_live, ends_at)
           VALUES (?, ?, ?, ?, ?)`,
          [
            body.eventId ?? null,
            String(body.question || ""),
            JSON.stringify(body.options || []),
            body.showLive === false ? 0 : 1,
            body.endsAt ? String(body.endsAt).slice(0, 10) : null,
          ],
        );
      });
      return NextResponse.json({ ok: true });
    }

    if (action === "vote") {
      const pollId = Number(body.pollId);
      const db = await getDb();
      const poll = rowFrom<{ ends_at: string | null }>(
        db,
        `SELECT ends_at FROM polls WHERE id = ?`,
        [pollId],
      );
      if (!poll) {
        return NextResponse.json({ error: "投票不存在" }, { status: 404 });
      }
      if (!isPollOpen(poll.ends_at)) {
        return NextResponse.json(
          { error: "投票已截止，只能查看最终结果" },
          { status: 400 },
        );
      }
      await withDb((db) => {
        db.run(
          `INSERT INTO poll_votes (poll_id, user_id, option_index) VALUES (?, ?, ?)
           ON CONFLICT(poll_id, user_id) DO UPDATE SET option_index = excluded.option_index`,
          [pollId, user.id, Number(body.optionIndex)],
        );
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
