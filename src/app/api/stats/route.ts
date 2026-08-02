import { NextResponse } from "next/server";
import { requireAdmin, requireUser } from "@/lib/auth";
import { assertModuleEnabled } from "@/lib/modules";
import { computeFunStats } from "@/lib/stats";
import { getDb, rowFrom, withDb } from "@/lib/db";

export async function GET() {
  try {
    await assertModuleEnabled("fun-stats");
    await requireUser();
    const db = await getDb();
    const pub = rowFrom<{ value: string }>(
      db,
      `SELECT value FROM site_settings WHERE key = 'stats_public'`,
    );
    if (pub?.value !== "1") {
      return NextResponse.json({ error: "公开统计已关闭" }, { status: 403 });
    }
    const anon = rowFrom<{ value: string }>(
      db,
      `SELECT value FROM site_settings WHERE key = 'stats_anonymous'`,
    );
    const stats = await computeFunStats(anon?.value === "1");
    return NextResponse.json({ stats, anonymous: anon?.value === "1" });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "ERROR" },
      { status: 400 },
    );
  }
}

export async function PATCH(req: Request) {
  try {
    await requireAdmin();
    const body = await req.json();
    await withDb((db) => {
      if (typeof body.statsPublic === "boolean") {
        db.run(
          `INSERT INTO site_settings (key, value) VALUES ('stats_public', ?)
           ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
          [body.statsPublic ? "1" : "0"],
        );
      }
      if (typeof body.statsAnonymous === "boolean") {
        db.run(
          `INSERT INTO site_settings (key, value) VALUES ('stats_anonymous', ?)
           ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
          [body.statsAnonymous ? "1" : "0"],
        );
      }
    });
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "ERROR" },
      { status: 400 },
    );
  }
}
