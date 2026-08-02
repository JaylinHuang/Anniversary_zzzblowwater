import path from "path";
import fs from "fs";
import initSqlJs from "sql.js";

const DATA_DIR = path.join(process.cwd(), "data");
const DB_PATH = path.join(DATA_DIR, "app.db");

async function main() {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  const SQL = await initSqlJs({
    locateFile: (file) =>
      path.join(process.cwd(), "node_modules", "sql.js", "dist", file),
  });
  const db = fs.existsSync(DB_PATH)
    ? new SQL.Database(fs.readFileSync(DB_PATH))
    : new SQL.Database();

  // 触发表结构：跑一次最小迁移片段（与 app 一致的关键表）
  db.run(`
    CREATE TABLE IF NOT EXISTS milestones (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title TEXT NOT NULL,
      happened_on TEXT NOT NULL,
      description TEXT DEFAULT '',
      image_url TEXT,
      tags TEXT DEFAULT '[]',
      quote_id INTEGER,
      published INTEGER DEFAULT 1,
      created_by INTEGER,
      created_at TEXT DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS quiz_questions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      question TEXT NOT NULL,
      options TEXT NOT NULL,
      answer_index INTEGER NOT NULL,
      badge TEXT,
      active INTEGER DEFAULT 1
    );
    CREATE TABLE IF NOT EXISTS events (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title TEXT NOT NULL,
      kind TEXT DEFAULT 'event',
      description TEXT DEFAULT '',
      starts_at TEXT,
      status TEXT DEFAULT 'open',
      published INTEGER DEFAULT 1,
      created_at TEXT DEFAULT (datetime('now'))
    );
  `);

  const milestones = [
    ["群星初聚", "2025-07-10", "因绝区零结缘，吹水群正式开张。", '["建群","起源"]'],
    ["第一次团战夜", "2025-09-01", "大家第一次约齐深渊/活动，聊到很晚。", '["联机"]'],
    ["梗开始自我繁殖", "2025-11-20", "若干无法外传的群梗正式封神。", '["梗"]'],
    ["正日一周年", "2026-07-10", "满一年。今年庆典因故改到 8/4。", '["周年"]'],
    ["推迟的狂欢", "2026-08-04", "正式周年庆活动日。", '["庆典"]'],
  ];

  for (const [title, happened_on, description, tags] of milestones) {
    db.run(
      `INSERT INTO milestones (title, happened_on, description, tags) VALUES (?, ?, ?, ?)`,
      [title, happened_on, description, tags],
    );
  }

  db.run(
    `INSERT INTO quiz_questions (question, options, answer_index, badge)
     VALUES (?, ?, ?, ?)`,
    [
      "本群正日周年是哪一天？",
      JSON.stringify(["6月1日", "7月10日", "8月4日", "12月25日"]),
      1,
      "日历绳匠",
    ],
  );

  db.run(
    `INSERT INTO events (title, kind, description, starts_at, status)
     VALUES (?, ?, ?, ?, ?)`,
    [
      "2026 吹水一周年庆典",
      "announcement",
      "正日 7/10，活动日 8/4。欢迎在祝福墙留言、玩扭蛋、点亮拼图。",
      "2026-08-04",
      "open",
    ],
  );

  fs.writeFileSync(DB_PATH, Buffer.from(db.export()));
  console.log("种子数据已写入", DB_PATH);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
