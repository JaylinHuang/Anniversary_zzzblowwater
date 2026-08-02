import { NextResponse } from "next/server";
import { requireModerator, requireUser } from "@/lib/auth";
import { assertModuleEnabled } from "@/lib/modules";
import { getDb, rowsFrom, withDb } from "@/lib/db";
import { suggestMilestonesFromQuotes } from "@/lib/milestone-suggest";

export async function GET(req: Request) {
  try {
    await assertModuleEnabled("memory-timeline");
    await requireUser();
    const url = new URL(req.url);
    if (url.searchParams.get("suggest") === "1") {
      await requireModerator();
      const suggestions = await suggestMilestonesFromQuotes(16);
      return NextResponse.json({ suggestions });
    }
    const month = url.searchParams.get("month");
    const tag = url.searchParams.get("tag");
    const db = await getDb();
    let sql = `SELECT * FROM milestones WHERE published = 1`;
    const params: (string | number)[] = [];
    if (month) {
      sql += ` AND substr(happened_on, 1, 7) = ?`;
      params.push(month);
    }
    sql += ` ORDER BY happened_on ASC`;
    let items = rowsFrom(db, sql, params);
    if (tag) {
      items = items.filter((i) => {
        const tags = JSON.parse(String(i.tags || "[]")) as string[];
        return tags.includes(tag);
      });
    }
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
    await assertModuleEnabled("memory-timeline");
    const user = await requireModerator();
    const body = await req.json();
    await withDb((db) => {
      db.run(
        `INSERT INTO milestones (title, happened_on, description, tags, quote_id, created_by)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [
          String(body.title || ""),
          String(body.happenedOn || ""),
          String(body.description || ""),
          JSON.stringify(body.tags || []),
          body.quoteId ?? null,
          user.id,
        ],
      );
    });
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "ERROR" },
      { status: 400 },
    );
  }
}
