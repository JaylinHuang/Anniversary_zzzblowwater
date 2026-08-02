import { NextResponse } from "next/server";
import { requireModerator, requireUser } from "@/lib/auth";
import { assertModuleEnabled } from "@/lib/modules";
import { getDb, rowsFrom, withDb, rowFrom } from "@/lib/db";

export async function GET() {
  try {
    await assertModuleEnabled("events-hub");
    await requireUser();
    const db = await getDb();
    const events = rowsFrom(
      db,
      `SELECT e.*,
        (SELECT COUNT(*) FROM event_rsvps r WHERE r.event_id = e.id) as rsvp_count
       FROM events e WHERE e.published = 1 ORDER BY e.created_at DESC`,
    );
    const polls = rowsFrom(db, `SELECT * FROM polls ORDER BY id DESC`).map((p) => {
      const options = JSON.parse(String(p.options || "[]")) as string[];
      const votes = rowsFrom<{ option_index: number; c: number }>(
        db,
        `SELECT option_index, COUNT(*) as c FROM poll_votes WHERE poll_id = ? GROUP BY option_index`,
        [p.id as number],
      );
      return {
        ...p,
        options,
        tallies: options.map((_, idx) => votes.find((v) => v.option_index === idx)?.c ?? 0),
      };
    });
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

    if (action === "rsvp") {
      const eventId = Number(body.eventId);
      await withDb((db) => {
        const exists = rowFrom(
          db,
          `SELECT 1 as x FROM event_rsvps WHERE event_id = ? AND user_id = ?`,
          [eventId, user.id],
        );
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
      });
      return NextResponse.json({ ok: true });
    }

    if (action === "poll-create") {
      await requireModerator();
      await withDb((db) => {
        db.run(
          `INSERT INTO polls (event_id, question, options, show_live) VALUES (?, ?, ?, ?)`,
          [
            body.eventId ?? null,
            String(body.question || ""),
            JSON.stringify(body.options || []),
            body.showLive === false ? 0 : 1,
          ],
        );
      });
      return NextResponse.json({ ok: true });
    }

    if (action === "vote") {
      await withDb((db) => {
        db.run(
          `INSERT INTO poll_votes (poll_id, user_id, option_index) VALUES (?, ?, ?)
           ON CONFLICT(poll_id, user_id) DO UPDATE SET option_index = excluded.option_index`,
          [Number(body.pollId), user.id, Number(body.optionIndex)],
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
