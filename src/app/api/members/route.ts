import { NextResponse } from "next/server";
import { getSessionUser, requireUser } from "@/lib/auth";
import { assertModuleEnabled } from "@/lib/modules";
import { getDb, rowsFrom, withDb, rowFrom } from "@/lib/db";

export async function GET() {
  try {
    await assertModuleEnabled("member-codex");
    await requireUser();
    const db = await getDb();
    const me = await getSessionUser();
    const members = rowsFrom<{
      id: number;
      display_name: string;
      bio: string;
      tags: string;
      mains: string;
      badges: string;
      public_profile: number;
      avatar_url: string | null;
      role: string;
    }>(
      db,
      `SELECT id, display_name, bio, tags, mains, badges, public_profile, avatar_url, role
       FROM users ORDER BY id ASC`,
    ).filter((m) => m.public_profile || m.id === me?.id || me?.role === "admin");
    return NextResponse.json({ members });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "ERROR";
    return NextResponse.json({ error: msg }, { status: 400 });
  }
}

export async function PATCH(req: Request) {
  try {
    await assertModuleEnabled("member-codex");
    const user = await requireUser();
    const body = await req.json();
    await withDb((db) => {
      db.run(
        `UPDATE users SET
          bio = COALESCE(?, bio),
          tags = COALESCE(?, tags),
          mains = COALESCE(?, mains),
          qq_number = COALESCE(?, qq_number),
          public_profile = COALESCE(?, public_profile),
          opt_out_leaderboard = COALESCE(?, opt_out_leaderboard)
         WHERE id = ?`,
        [
          body.bio ?? null,
          body.tags ? JSON.stringify(body.tags) : null,
          body.mains ?? null,
          body.qqNumber ?? null,
          typeof body.publicProfile === "boolean"
            ? body.publicProfile
              ? 1
              : 0
            : null,
          typeof body.optOutLeaderboard === "boolean"
            ? body.optOutLeaderboard
              ? 1
              : 0
            : null,
          user.id,
        ],
      );
    });
    const db = await getDb();
    const updated = rowFrom(db, `SELECT * FROM users WHERE id = ?`, [user.id]);
    return NextResponse.json({ ok: true, user: updated });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "ERROR";
    return NextResponse.json({ error: msg }, { status: 400 });
  }
}
