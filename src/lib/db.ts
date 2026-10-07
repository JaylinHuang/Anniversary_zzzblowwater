import fs from "fs";
import path from "path";
import initSqlJs, { Database, SqlValue } from "sql.js";
import { todayKey } from "./date-key";

const DATA_DIR = path.join(process.cwd(), "data");
const DB_PATH = path.join(DATA_DIR, "app.db");

let dbPromise: Promise<Database> | null = null;

function ensureDataDir() {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
  const uploads = path.join(DATA_DIR, "uploads");
  if (!fs.existsSync(uploads)) fs.mkdirSync(uploads, { recursive: true });
}

function persist(db: Database) {
  ensureDataDir();
  const data = db.export();
  fs.writeFileSync(DB_PATH, Buffer.from(data));
}

/**
 * 私聊分身的分层记忆表。
 * 长期记忆按 (分身 id, 网站用户 id) 隔离，别人检索不到；
 * 工作记忆只属于一轮，轮内记下查过什么、用了哪个工具、走到第几步。
 * 迁移和自测脚本共用这一份建表语句，避免两边写法漂移。
 */
export const AGENT_MEMORY_SCHEMA_SQL = `
  CREATE TABLE IF NOT EXISTS agent_user_memory (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    agent_id INTEGER NOT NULL,
    user_id INTEGER NOT NULL,
    topic TEXT NOT NULL DEFAULT '',
    fact TEXT NOT NULL,
    kind TEXT NOT NULL DEFAULT 'fact',
    importance REAL NOT NULL DEFAULT 0.35,
    hit_count INTEGER NOT NULL DEFAULT 0,
    vector_json TEXT DEFAULT '',
    superseded_by INTEGER,
    last_hit_at TEXT,
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now'))
  );

  CREATE INDEX IF NOT EXISTS idx_agent_user_memory_scope
    ON agent_user_memory(agent_id, user_id, superseded_by);

  CREATE TABLE IF NOT EXISTS agent_working_memory (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    turn_id TEXT NOT NULL,
    agent_id INTEGER NOT NULL,
    user_id INTEGER NOT NULL,
    step INTEGER NOT NULL DEFAULT 0,
    tool TEXT NOT NULL DEFAULT '',
    note TEXT NOT NULL DEFAULT '',
    created_at TEXT DEFAULT (datetime('now'))
  );

  CREATE INDEX IF NOT EXISTS idx_agent_working_memory_turn
    ON agent_working_memory(turn_id, user_id);

  CREATE TABLE IF NOT EXISTS agent_dm_window (
    session_id INTEGER PRIMARY KEY,
    user_id INTEGER NOT NULL,
    agent_id INTEGER NOT NULL,
    compressed_upto_id INTEGER NOT NULL DEFAULT 0,
    updated_at TEXT DEFAULT (datetime('now'))
  );
`;

/** 建表 + 兼容旧库的逐列 ALTER。新库跑 ALTER 会直接抛错，吞掉即可 */
export function migrateAgentMemory(db: Database) {
  db.run(AGENT_MEMORY_SCHEMA_SQL);
  const alters = [
    `ALTER TABLE agent_user_memory ADD COLUMN topic TEXT NOT NULL DEFAULT ''`,
    `ALTER TABLE agent_user_memory ADD COLUMN kind TEXT NOT NULL DEFAULT 'fact'`,
    `ALTER TABLE agent_user_memory ADD COLUMN importance REAL NOT NULL DEFAULT 0.35`,
    `ALTER TABLE agent_user_memory ADD COLUMN hit_count INTEGER NOT NULL DEFAULT 0`,
    `ALTER TABLE agent_user_memory ADD COLUMN vector_json TEXT DEFAULT ''`,
    `ALTER TABLE agent_user_memory ADD COLUMN superseded_by INTEGER`,
    `ALTER TABLE agent_user_memory ADD COLUMN last_hit_at TEXT`,
  ];
  for (const sql of alters) {
    try {
      db.run(sql);
    } catch {
      /* 已存在 */
    }
  }
}

function migrate(db: Database) {
  db.run(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      display_name TEXT NOT NULL,
      qq_number TEXT,
      avatar_url TEXT,
      bio TEXT DEFAULT '',
      tags TEXT DEFAULT '[]',
      mains TEXT DEFAULT '',
      public_profile INTEGER DEFAULT 1,
      opt_out_leaderboard INTEGER DEFAULT 0,
      role TEXT DEFAULT 'member',
      badges TEXT DEFAULT '[]',
      created_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS sessions (
      token TEXT PRIMARY KEY,
      user_id INTEGER NOT NULL,
      created_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY(user_id) REFERENCES users(id)
    );

    CREATE TABLE IF NOT EXISTS qq_email_codes (
      qq TEXT PRIMARY KEY,
      code_hash TEXT NOT NULL,
      sent_at TEXT NOT NULL,
      expires_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS feature_flags (
      module_key TEXT PRIMARY KEY,
      enabled INTEGER DEFAULT 1
    );

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

    CREATE TABLE IF NOT EXISTS import_batches (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      filename TEXT NOT NULL,
      message_count INTEGER DEFAULT 0,
      time_start TEXT,
      time_end TEXT,
      status TEXT DEFAULT 'active',
      created_by INTEGER,
      created_at TEXT DEFAULT (datetime('now')),
      agent_refreshed_at TEXT
    );

    CREATE TABLE IF NOT EXISTS chat_messages (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      batch_id INTEGER NOT NULL,
      sender TEXT NOT NULL,
      qq_number TEXT,
      sent_at TEXT,
      content TEXT NOT NULL,
      content_raw TEXT NOT NULL,
      is_quote INTEGER DEFAULT 0,
      source_msg_id TEXT,
      FOREIGN KEY(batch_id) REFERENCES import_batches(id)
    );

    CREATE TABLE IF NOT EXISTS wishes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      content TEXT NOT NULL,
      likes INTEGER DEFAULT 0,
      hidden INTEGER DEFAULT 0,
      created_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS capsules (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      content TEXT NOT NULL,
      unlock_on TEXT NOT NULL,
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

    CREATE TABLE IF NOT EXISTS quiz_answers (
      user_id INTEGER NOT NULL,
      question_id INTEGER NOT NULL,
      correct INTEGER NOT NULL,
      answered_at TEXT DEFAULT (datetime('now')),
      PRIMARY KEY(user_id, question_id)
    );

    CREATE TABLE IF NOT EXISTS fortune_draws (
      user_id INTEGER NOT NULL,
      day_key TEXT NOT NULL,
      slip TEXT NOT NULL,
      PRIMARY KEY(user_id, day_key)
    );

    CREATE TABLE IF NOT EXISTS puzzle_pieces (
      piece_index INTEGER PRIMARY KEY,
      user_id INTEGER,
      lit_at TEXT
    );

    CREATE TABLE IF NOT EXISTS puzzle_daily (
      user_id INTEGER NOT NULL,
      day_key TEXT NOT NULL,
      count INTEGER DEFAULT 0,
      PRIMARY KEY(user_id, day_key)
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

    CREATE TABLE IF NOT EXISTS event_rsvps (
      event_id INTEGER NOT NULL,
      user_id INTEGER NOT NULL,
      created_at TEXT DEFAULT (datetime('now')),
      PRIMARY KEY(event_id, user_id)
    );

    CREATE TABLE IF NOT EXISTS polls (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      event_id INTEGER,
      question TEXT NOT NULL,
      options TEXT NOT NULL,
      show_live INTEGER DEFAULT 1,
      ends_at TEXT,
      created_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS poll_votes (
      poll_id INTEGER NOT NULL,
      user_id INTEGER NOT NULL,
      option_index INTEGER NOT NULL,
      PRIMARY KEY(poll_id, user_id)
    );

    CREATE TABLE IF NOT EXISTS media_items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      title TEXT DEFAULT '',
      tags TEXT DEFAULT '[]',
      path TEXT NOT NULL,
      status TEXT DEFAULT 'pending',
      likes INTEGER DEFAULT 0,
      created_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS media_likes (
      media_id INTEGER NOT NULL,
      user_id INTEGER NOT NULL,
      PRIMARY KEY(media_id, user_id)
    );

    CREATE TABLE IF NOT EXISTS media_comments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      media_id INTEGER NOT NULL,
      user_id INTEGER NOT NULL,
      content TEXT NOT NULL,
      created_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS site_settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS lore_figures (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      epithet TEXT DEFAULT '',
      summary TEXT DEFAULT '',
      avatar_text TEXT DEFAULT '',
      hue INTEGER DEFAULT 180,
      pos_x REAL DEFAULT 50,
      pos_y REAL DEFAULT 50,
      published INTEGER DEFAULT 1,
      created_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS lore_relations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      from_id INTEGER NOT NULL,
      to_id INTEGER NOT NULL,
      label TEXT NOT NULL,
      created_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY(from_id) REFERENCES lore_figures(id),
      FOREIGN KEY(to_id) REFERENCES lore_figures(id)
    );

    CREATE TABLE IF NOT EXISTS lore_anecdotes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      figure_id INTEGER NOT NULL,
      title TEXT NOT NULL,
      body TEXT NOT NULL,
      era_label TEXT DEFAULT '',
      sort_order INTEGER DEFAULT 0,
      published INTEGER DEFAULT 1,
      created_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY(figure_id) REFERENCES lore_figures(id)
    );

    CREATE TABLE IF NOT EXISTS agent_roster_meta (
      id INTEGER PRIMARY KEY CHECK (id = 1),
      threshold INTEGER NOT NULL,
      baseline_size INTEGER NOT NULL,
      locked_at TEXT NOT NULL,
      note TEXT DEFAULT ''
    );

    CREATE TABLE IF NOT EXISTS agent_personas (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      qq TEXT NOT NULL UNIQUE,
      display_name TEXT NOT NULL,
      illustration_url TEXT DEFAULT '',
      style_tags TEXT DEFAULT '[]',
      summary TEXT DEFAULT '',
      system_prompt TEXT NOT NULL,
      sample_quotes TEXT DEFAULT '[]',
      source_msg_count INTEGER DEFAULT 0,
      sealed INTEGER DEFAULT 1,
      enabled INTEGER DEFAULT 1,
      built_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS agent_user_drifts (
      user_id INTEGER NOT NULL,
      agent_id INTEGER NOT NULL,
      drift_notes TEXT DEFAULT '',
      updated_at TEXT DEFAULT (datetime('now')),
      PRIMARY KEY (user_id, agent_id)
    );

    CREATE TABLE IF NOT EXISTS agent_dm_sessions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      agent_id INTEGER NOT NULL,
      active INTEGER DEFAULT 1,
      turn_count INTEGER DEFAULT 0,
      created_at TEXT DEFAULT (datetime('now')),
      closed_at TEXT
    );

    CREATE TABLE IF NOT EXISTS agent_dm_messages (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      session_id INTEGER NOT NULL,
      user_id INTEGER NOT NULL,
      agent_id INTEGER NOT NULL,
      role TEXT NOT NULL,
      content TEXT NOT NULL,
      day_key TEXT,
      created_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY(session_id) REFERENCES agent_dm_sessions(id)
    );

    -- 旧版按分身共享的记忆表：已经没有任何代码读写，只为兼容旧库保留；
    -- 现在的长期记忆见 agent_user_memory，按 (分身, 网站用户) 隔离
    CREATE TABLE IF NOT EXISTS agent_shared_memory (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      agent_id INTEGER NOT NULL,
      fact TEXT NOT NULL,
      source_user_id INTEGER,
      source_name TEXT DEFAULT '',
      updated_at TEXT DEFAULT (datetime('now'))
    );

    -- 一轮提问的任务仓库：调度和子任务读写同一份，角色在一轮里不能重复
    CREATE TABLE IF NOT EXISTS agent_task_runs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      turn_id TEXT NOT NULL,
      agent_id INTEGER NOT NULL,
      user_id INTEGER NOT NULL,
      role TEXT NOT NULL,
      scope TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending',
      output TEXT DEFAULT '',
      updated_at TEXT DEFAULT (datetime('now')),
      UNIQUE(turn_id, role)
    );

    CREATE TABLE IF NOT EXISTS daily_checkins (
      user_id INTEGER NOT NULL,
      checkin_date TEXT NOT NULL,
      stamp TEXT NOT NULL DEFAULT '',
      created_at TEXT DEFAULT (datetime('now')),
      PRIMARY KEY (user_id, checkin_date)
    );

    CREATE TABLE IF NOT EXISTS guess_rounds (
      id TEXT PRIMARY KEY,
      user_id INTEGER NOT NULL,
      message_id INTEGER NOT NULL,
      content TEXT NOT NULL,
      options TEXT NOT NULL,
      answer_index INTEGER NOT NULL,
      answered INTEGER DEFAULT 0,
      correct INTEGER,
      day_key TEXT,
      created_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS chat_embeddings (
      message_id INTEGER PRIMARY KEY,
      qq_number TEXT NOT NULL,
      model TEXT NOT NULL,
      dims INTEGER NOT NULL,
      vector_json TEXT NOT NULL,
      content_preview TEXT DEFAULT '',
      updated_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY(message_id) REFERENCES chat_messages(id)
    );
  `);

  migrateAgentMemory(db);

  try {
    db.run(
      `CREATE INDEX IF NOT EXISTS idx_chat_embeddings_qq
       ON chat_embeddings(qq_number)`,
    );
  } catch {
    /* ignore */
  }
  try {
    db.run(`DROP TABLE IF EXISTS live_inbox`);
  } catch {
    /* 旧库没有这张表 */
  }

  // 默认模块开关
  const modules = [
    "member-codex",
    "memory-timeline",
    "chat-archive",
    "fun-stats",
    "wish-wall",
    "party-games",
    "events-hub",
    "media-gallery",
    "member-agents",
  ];
  for (const key of modules) {
    db.run(
      `INSERT OR IGNORE INTO feature_flags (module_key, enabled) VALUES (?, 1)`,
      [key],
    );
  }
  // 人物星图已下线，旧库里的开关一并关掉
  db.run(
    `UPDATE feature_flags SET enabled = 0 WHERE module_key = 'lore-constellation'`,
  );

  // 默认公开统计开启
  db.run(
    `INSERT OR IGNORE INTO site_settings (key, value) VALUES ('stats_public', '1')`,
  );
  db.run(
    `INSERT OR IGNORE INTO site_settings (key, value) VALUES ('stats_anonymous', '0')`,
  );

  // 拼图 36 格
  for (let i = 0; i < 36; i++) {
    db.run(`INSERT OR IGNORE INTO puzzle_pieces (piece_index) VALUES (?)`, [i]);
  }

  // 默认群梗考题（仅空表时植入，可被管理端继续追加）
  const quizCountExec = db.exec(`SELECT COUNT(*) as c FROM quiz_questions`);
  const quizCount = Number(quizCountExec[0]?.values?.[0]?.[0] ?? 0);
  if (quizCount === 0) {
    const defaults: [string, string[], number, string][] = [
      [
        "zzz吹水群的正日周年是哪一天？",
        ["6/10", "7/10", "8/4", "9/9"],
        1,
        "正日达人",
      ],
      [
        "今年庆典活动日改到了哪天？",
        ["2026-07-10", "2026-08-04", "2026-08-10", "2025-07-10"],
        1,
        "庆典日历",
      ],
      [
        "群友 Agent 对话会写进群聊归档吗？",
        ["会", "不会，只进私有 DM", "管理员可见", "随机"],
        1,
        "隐私守则",
      ],
    ];
    for (const [question, options, answerIndex, badge] of defaults) {
      db.run(
        `INSERT INTO quiz_questions (question, options, answer_index, badge)
         VALUES (?, ?, ?, ?)`,
        [question, JSON.stringify(options), answerIndex, badge],
      );
    }
  }

  // 兼容旧库
  try {
    db.run(`ALTER TABLE chat_messages ADD COLUMN source_msg_id TEXT`);
  } catch {
    /* 已存在 */
  }
  try {
    db.run(`ALTER TABLE import_batches ADD COLUMN agent_refreshed_at TEXT`);
    // 只在加列的这一次把已有批次标成跟进过，避免凌晨把整份旧归档重炼一遍
    db.run(
      `UPDATE import_batches SET agent_refreshed_at = datetime('now') WHERE agent_refreshed_at IS NULL`,
    );
  } catch {
    /* 已存在 */
  }
  try {
    db.run(`ALTER TABLE chat_messages ADD COLUMN qq_number TEXT`);
  } catch {
    /* 已存在 */
  }
  try {
    db.run(`ALTER TABLE polls ADD COLUMN ends_at TEXT`);
  } catch {
    /* 已存在 */
  }

  // 猜说话人：新增「本地日期」列，每日上限按它计数（不再用 UTC 的 created_at）
  try {
    db.run(`ALTER TABLE guess_rounds ADD COLUMN day_key TEXT`);
  } catch {
    /* 已存在 */
  }
  try {
    // 旧数据补齐：created_at 是 UTC 时间，转成本地时间后再取本地年月日（与 todayKey 同口径）
    const legacy = db.exec(
      `SELECT id, created_at FROM guess_rounds WHERE day_key IS NULL`,
    );
    const rows = legacy[0]?.values ?? [];
    for (const [id, createdAt] of rows) {
      const utc = new Date(`${String(createdAt).replace(" ", "T")}Z`);
      const key = Number.isNaN(utc.getTime()) ? todayKey() : todayKey(utc);
      db.run(`UPDATE guess_rounds SET day_key = ? WHERE id = ?`, [
        key,
        String(id),
      ]);
    }
    db.run(
      `CREATE INDEX IF NOT EXISTS idx_guess_rounds_user_day
       ON guess_rounds(user_id, day_key)`,
    );
  } catch {
    /* ignore */
  }

  // Agent 单聊：新增「本地日期」列，每日额度按它计数（不再用 UTC 的 created_at）
  try {
    db.run(`ALTER TABLE agent_dm_messages ADD COLUMN day_key TEXT`);
  } catch {
    /* 已存在 */
  }
  try {
    // 旧数据补齐：created_at 是 UTC 时间，转成本地时间后再取本地年月日（与 todayKey 同口径）
    const legacy = db.exec(
      `SELECT id, created_at FROM agent_dm_messages WHERE day_key IS NULL`,
    );
    const rows = legacy[0]?.values ?? [];
    for (const [id, createdAt] of rows) {
      const utc = new Date(`${String(createdAt).replace(" ", "T")}Z`);
      const key = Number.isNaN(utc.getTime()) ? todayKey() : todayKey(utc);
      db.run(`UPDATE agent_dm_messages SET day_key = ? WHERE id = ?`, [
        key,
        Number(id),
      ]);
    }
    db.run(
      `CREATE INDEX IF NOT EXISTS idx_agent_dm_messages_user_day
       ON agent_dm_messages(user_id, role, day_key)`,
    );
  } catch {
    /* ignore */
  }

  // 历史同名去重：保留最小 id，其余改成「昵称#id」
  try {
    const all = db.exec(
      `SELECT id, display_name FROM users ORDER BY id ASC`,
    );
    const seen = new Map<string, number>();
    for (const row of all[0]?.values || []) {
      const id = Number(row[0]);
      const name = String(row[1]);
      const key = name.toLowerCase();
      if (!seen.has(key)) {
        seen.set(key, id);
        continue;
      }
      db.run(`UPDATE users SET display_name = ? WHERE id = ?`, [
        `${name}#${id}`,
        id,
      ]);
    }
  } catch {
    /* ignore */
  }
  try {
    db.run(
      `CREATE UNIQUE INDEX IF NOT EXISTS idx_users_display_name_nocase
       ON users(display_name COLLATE NOCASE)`,
    );
  } catch {
    /* 仍有冲突则下次启动再试 */
  }
  try {
    db.run(
      `CREATE UNIQUE INDEX IF NOT EXISTS idx_users_qq_number
       ON users(qq_number) WHERE qq_number IS NOT NULL AND qq_number != ''`,
    );
  } catch {
    /* 仍有冲突则下次启动再试 */
  }

  // 旧多 Agent 房间 / sender_key 人设表 → 迁到 QQ 名册模型
  try {
    const info = db.exec(`PRAGMA table_info(agent_personas)`);
    const colNames = new Set(
      (info[0]?.values || []).map((row) => String(row[1])),
    );
    if (colNames.size > 0 && !colNames.has("qq")) {
      db.run(`DROP TABLE IF EXISTS agent_messages`);
      db.run(`DROP TABLE IF EXISTS agent_rooms`);
      db.run(`DROP TABLE IF EXISTS agent_personas`);
      db.run(`
        CREATE TABLE agent_personas (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          qq TEXT NOT NULL UNIQUE,
          display_name TEXT NOT NULL,
          illustration_url TEXT DEFAULT '',
          style_tags TEXT DEFAULT '[]',
          summary TEXT DEFAULT '',
          system_prompt TEXT NOT NULL,
          sample_quotes TEXT DEFAULT '[]',
          source_msg_count INTEGER DEFAULT 0,
          sealed INTEGER DEFAULT 1,
          enabled INTEGER DEFAULT 1,
          built_at TEXT DEFAULT (datetime('now')),
          updated_at TEXT DEFAULT (datetime('now'))
        );
      `);
    } else if (colNames.size > 0 && !colNames.has("illustration_url")) {
      db.run(
        `ALTER TABLE agent_personas ADD COLUMN illustration_url TEXT DEFAULT ''`,
      );
    }
  } catch {
    /* ignore */
  }
}

export async function getDb(): Promise<Database> {
  if (!dbPromise) {
    dbPromise = (async () => {
      ensureDataDir();
      const SQL = await initSqlJs({
        locateFile: (file) =>
          path.join(process.cwd(), "node_modules", "sql.js", "dist", file),
      });
      let db: Database;
      if (fs.existsSync(DB_PATH)) {
        const buf = fs.readFileSync(DB_PATH);
        db = new SQL.Database(buf);
      } else {
        db = new SQL.Database();
      }
      migrate(db);
      persist(db);
      return db;
    })();
  }
  return dbPromise;
}

export async function withDb<T>(fn: (db: Database) => T): Promise<T> {
  const db = await getDb();
  const result = fn(db);
  persist(db);
  return result;
}

/**
 * 整库落盘。sql.js 每次 persist 都要写整个文件，
 * 一轮里连续写多条记忆时，由调用方攒完再喊一次，不要一句话一行。
 */
export async function flushDb(): Promise<void> {
  persist(await getDb());
}

export function rowsFrom<T extends Record<string, SqlValue>>(
  db: Database,
  sql: string,
  params: SqlValue[] = [],
): T[] {
  const stmt = db.prepare(sql);
  stmt.bind(params);
  const out: T[] = [];
  while (stmt.step()) {
    out.push(stmt.getAsObject() as T);
  }
  stmt.free();
  return out;
}

export function rowFrom<T extends Record<string, SqlValue>>(
  db: Database,
  sql: string,
  params: SqlValue[] = [],
): T | null {
  const rows = rowsFrom<T>(db, sql, params);
  return rows[0] ?? null;
}
