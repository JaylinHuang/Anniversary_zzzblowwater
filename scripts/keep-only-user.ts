/**
 * 只保留指定昵称用户，删除其余账号及其关联数据
 * 用法: npx tsx scripts/keep-only-user.ts sr.11
 */
import fs from "fs";
import path from "path";
import initSqlJs, { type Database } from "sql.js";

const keepName = (process.argv[2] || "sr.11").trim();

function run(db: Database, sql: string, params: (string | number)[] = []) {
  db.run(sql, params);
}

async function main() {
  const DB_PATH = path.join(process.cwd(), "data", "app.db");
  const SQL = await initSqlJs({
    locateFile: (f) => path.join(process.cwd(), "node_modules/sql.js/dist", f),
  });
  const db = new SQL.Database(fs.readFileSync(DB_PATH));

  const keepStmt = db.prepare(
    `SELECT id, display_name, role FROM users WHERE display_name = ? COLLATE NOCASE`,
  );
  keepStmt.bind([keepName]);
  if (!keepStmt.step()) {
    keepStmt.free();
    console.error(`未找到昵称「${keepName}」`);
    process.exit(1);
  }
  const keep = keepStmt.getAsObject() as {
    id: number;
    display_name: string;
    role: string;
  };
  keepStmt.free();

  // 若同名多个（不应发生），取最大 id（最近建档）
  const allKeep = db.exec(
    `SELECT id FROM users WHERE display_name = '${keepName.replace(/'/g, "''")}' COLLATE NOCASE ORDER BY id DESC`,
  );
  const keepId = Number(allKeep[0]?.values?.[0]?.[0] ?? keep.id);

  run(db, `UPDATE users SET role = 'admin', display_name = ? WHERE id = ?`, [
    keepName,
    keepId,
  ]);

  const del = db.exec(`SELECT id, display_name FROM users WHERE id != ${keepId}`);
  console.log("保留:", `#${keepId}`, keepName, "admin");
  console.log(
    "删除:",
    (del[0]?.values || []).map((r) => `#${r[0]} ${r[1]}`).join(", ") || "(无)",
  );

  const tablesWithUserId = [
    "sessions",
    "wishes",
    "capsules",
    "quiz_answers",
    "fortune_draws",
    "puzzle_daily",
    "event_rsvps",
    "poll_votes",
    "media_likes",
    "media_items",
    "agent_user_drifts",
    "agent_dm_messages",
    "agent_dm_sessions",
    "checkins",
  ];

  for (const t of tablesWithUserId) {
    try {
      run(db, `DELETE FROM ${t} WHERE user_id != ?`, [keepId]);
    } catch {
      /* 表不存在 */
    }
  }
  try {
    run(db, `UPDATE puzzle_pieces SET user_id = NULL WHERE user_id != ?`, [
      keepId,
    ]);
  } catch {
    /* ignore */
  }

  run(db, `DELETE FROM users WHERE id != ?`, [keepId]);

  fs.writeFileSync(DB_PATH, Buffer.from(db.export()));

  const left = db.exec(`SELECT id, display_name, role FROM users`);
  console.log("剩余用户:", left[0]?.values || []);
  console.log("完成。请重启 npm run dev。");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
