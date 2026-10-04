/**
 * 查看本地库各模块内容数量，方便决定补什么
 */
import { getDb, rowFrom } from "../src/lib/db";

async function main() {
  const db = await getDb();
  const checks: [string, string][] = [
    ["users", "SELECT COUNT(*) as c FROM users"],
    ["milestones", "SELECT COUNT(*) as c FROM milestones"],
    [
      "chat_messages",
      `SELECT COUNT(*) as c FROM chat_messages m
       JOIN import_batches b ON b.id = m.batch_id WHERE b.status = 'active'`,
    ],
    [
      "quotes",
      `SELECT COUNT(*) as c FROM chat_messages m
       JOIN import_batches b ON b.id = m.batch_id
       WHERE b.status = 'active' AND m.is_quote = 1`,
    ],
    ["wishes", "SELECT COUNT(*) as c FROM wishes"],
    ["events", "SELECT COUNT(*) as c FROM events"],
    ["polls", "SELECT COUNT(*) as c FROM polls"],
    ["quiz_questions", "SELECT COUNT(*) as c FROM quiz_questions WHERE active = 1"],
    ["lore_figures", "SELECT COUNT(*) as c FROM lore_figures"],
    ["agents", "SELECT COUNT(*) as c FROM agent_personas WHERE enabled = 1"],
    ["gallery", "SELECT COUNT(*) as c FROM gallery_items"],
    ["capsules", "SELECT COUNT(*) as c FROM time_capsules"],
  ];

  console.log("== 本地内容盘点 ==");
  for (const [name, sql] of checks) {
    try {
      const c = Number(rowFrom<{ c: number }>(db, sql)?.c ?? 0);
      console.log(`${name.padEnd(16)} ${c}`);
    } catch (e) {
      console.log(
        `${name.padEnd(16)} ERR ${(e as Error).message}`,
      );
    }
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
