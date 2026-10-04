/**
 * 确保周年庆活动 + 服务器集资投票存在（可重复执行）
 */
import path from "path";
import fs from "fs";
import initSqlJs, { type Database } from "sql.js";

const DATA_DIR = path.join(process.cwd(), "data");
const DB_PATH = path.join(DATA_DIR, "app.db");

const EVENT_TITLE = "zzz吹水群 · 2026 周年庆";
const POLL_QUESTION =
  "是否愿意和群友集资租用公网服务器（约 $6/月，用于周年站长期访问）？";

function oneId(db: Database, sql: string, params: (string | number)[]): number | null {
  const stmt = db.prepare(sql);
  stmt.bind(params);
  let id: number | null = null;
  if (stmt.step()) {
    id = Number(stmt.getAsObject().id);
  }
  stmt.free();
  return Number.isFinite(id) ? id : null;
}

async function main() {
  if (!fs.existsSync(DB_PATH)) {
    console.error("未找到 data/app.db，请先 npm run db:init 或启动一次站点");
    process.exit(1);
  }
  const SQL = await initSqlJs({
    locateFile: (file) =>
      path.join(process.cwd(), "node_modules", "sql.js", "dist", file),
  });
  const db = new SQL.Database(fs.readFileSync(DB_PATH));

  try {
    db.run(`ALTER TABLE polls ADD COLUMN ends_at TEXT`);
  } catch {
    /* 已有 */
  }

  let eventId = oneId(db, `SELECT id FROM events WHERE title = ? LIMIT 1`, [
    EVENT_TITLE,
  ]);
  if (eventId != null) {
    console.log("周年庆活动已存在 #" + eventId);
  } else {
    db.run(
      `INSERT INTO events (title, kind, description, starts_at, status, published)
       VALUES (?, ?, ?, ?, ?, 1)`,
      [
        EVENT_TITLE,
        "announcement",
        "正日周年 7/10，今年庆典活动日 8/4。欢迎进站写下祝福、报名参与、投票表态。群聊归档与更多梗玩法会陆续补上。",
        "2026-08-04",
        "open",
      ],
    );
    eventId = oneId(db, `SELECT last_insert_rowid() as id`, [])!;
    console.log("已创建周年庆活动 #" + eventId);
  }

  const pollId = oneId(db, `SELECT id FROM polls WHERE question = ? LIMIT 1`, [
    POLL_QUESTION,
  ]);
  if (pollId != null) {
    console.log("集资投票已存在 #" + pollId);
  } else {
    const options = [
      "愿意参与分摊（约 $6/月）",
      "暂不考虑",
      "再观望 / 需要更多说明",
    ];
    db.run(
      `INSERT INTO polls (event_id, question, options, show_live, ends_at)
       VALUES (?, ?, ?, 1, ?)`,
      [eventId, POLL_QUESTION, JSON.stringify(options), "2026-08-05"],
    );
    console.log("已创建集资投票（截止 2026-08-05，开启期实时出票）");
  }

  fs.writeFileSync(DB_PATH, Buffer.from(db.export()));
  console.log("完成 →", DB_PATH);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
