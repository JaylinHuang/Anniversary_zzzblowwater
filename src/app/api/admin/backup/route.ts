import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { getDb, rowsFrom } from "@/lib/db";
import { GROUP_NAME } from "@/lib/constants";

/** 导出可迁移的站点快照（不含会话令牌与口令） */
export async function GET() {
  try {
    await requireAdmin();
    const db = await getDb();

    const snapshot = {
      meta: {
        groupName: GROUP_NAME,
        exportedAt: new Date().toISOString(),
        version: 1,
      },
      counts: {
        users: rowsFrom(db, `SELECT COUNT(*) as c FROM users`)[0],
        messages: rowsFrom(db, `SELECT COUNT(*) as c FROM chat_messages`)[0],
        wishes: rowsFrom(db, `SELECT COUNT(*) as c FROM wishes`)[0],
        agents: rowsFrom(db, `SELECT COUNT(*) as c FROM agent_personas`)[0],
        checkins: rowsFrom(db, `SELECT COUNT(*) as c FROM daily_checkins`)[0],
      },
      featureFlags: rowsFrom(db, `SELECT * FROM feature_flags`),
      siteSettings: rowsFrom(db, `SELECT * FROM site_settings`),
      milestones: rowsFrom(db, `SELECT * FROM milestones ORDER BY id`),
      rosterMeta: rowsFrom(db, `SELECT * FROM agent_roster_meta`),
      agents: rowsFrom(
        db,
        `SELECT id, qq, display_name, style_tags, summary, source_msg_count,
                sealed, enabled, built_at, updated_at
         FROM agent_personas ORDER BY id`,
      ),
      // 金句仅导出标记内容（脱敏后正文），便于迁移「今日金句」素材
      quotes: rowsFrom(
        db,
        `SELECT m.id, m.sender, m.qq_number, m.sent_at, m.content
         FROM chat_messages m
         JOIN import_batches b ON b.id = m.batch_id
         WHERE m.is_quote = 1 AND b.status = 'active'
         ORDER BY m.id LIMIT 2000`,
      ),
    };

    return new NextResponse(JSON.stringify(snapshot, null, 2), {
      headers: {
        "Content-Type": "application/json; charset=utf-8",
        "Content-Disposition": `attachment; filename="zzzblowwater-backup-${Date.now()}.json"`,
      },
    });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "ERROR" },
      { status: 403 },
    );
  }
}
