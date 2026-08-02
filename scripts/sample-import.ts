import path from "path";
import fs from "fs";
import initSqlJs from "sql.js";
import { parseQqTxt } from "../src/lib/chat-parser";
import { desensitize } from "../src/lib/desensitize";

/** 多发言人演示语料：足以跑通解析、脱敏、金句、名册计票 */
const sample = `
消息记录（群聊）.
2025-07-10 21:05:33 绳匠甲(10001)
今天建群啦！绝区零冲！
2025-07-10 21:06:10 绳匠乙(10002)
来了来了，我电话是 13812345678 别外传啊
2025-07-10 21:07:00 夜猫丙(10003)
还在打，修仙中 https://example.com/secret
2025-07-10 21:08:00 邦布丁(10004)
[图片]
2025-07-10 21:09:00 绳匠甲(10001)
先定个群规：别人身攻击，玩梗随意
2025-07-11 00:12:00 夜猫丙(10003)
凌晨了还在清空洞，谁懂
2025-07-12 19:30:00 电波戊(10005)
今天翻车了，笑死
2025-08-01 01:22:08 夜猫丙(10003)
又是修仙局
2025-09-01 20:00:00 绳匠乙(10002)
九月活动有人报名吗
2025-10-10 12:00:00 邦布丁(10004)
邦布出击！
2025-11-11 11:11:00 电波戊(10005)
光棍节也要上分
2025-12-24 23:50:00 绳匠甲(10001)
平安夜还在吹水，绝了
2026-01-01 00:01:00 夜猫丙(10003)
新年第一句：冲
2026-02-14 21:00:00 绳匠乙(10002)
情人节还在肝活动
2026-03-03 18:00:00 迷雾己(10006)
新人报到，群氛围好好
2026-04-04 22:00:00 电波戊(10005)
清明也在线，离谱
2026-05-01 10:00:00 邦布丁(10004)
劳动节打本去
2026-06-06 06:06:00 夜猫丙(10003)
早起修仙失败
2026-07-09 20:00:00 绳匠甲(10001)
明天正日一周年，庆典改到八月四号见！
2026-07-10 12:00:00 绳匠乙(10002)
正日快乐！吹水群一周年！
2026-07-10 12:05:00 迷雾己(10006)
生日快乐 zzz吹水群
2026-07-10 18:00:00 电波戊(10005)
金句预备：一句冷梗可能成为明年金句
2026-07-11 09:00:00 电波戊(10005)
补一句：票数要冲过阈值才能进 Agent 名册
`;

async function main() {
  const DATA_DIR = path.join(process.cwd(), "data");
  const DB_PATH = path.join(DATA_DIR, "app.db");
  fs.mkdirSync(DATA_DIR, { recursive: true });
  const SQL = await initSqlJs({
    locateFile: (file) =>
      path.join(process.cwd(), "node_modules", "sql.js", "dist", file),
  });
  if (!fs.existsSync(DB_PATH)) {
    console.error("请先启动一次应用或运行 db:seed 以初始化数据库");
    process.exit(1);
  }
  const db = new SQL.Database(fs.readFileSync(DB_PATH));
  // 确保打卡表存在（兼容旧库）
  db.run(`
    CREATE TABLE IF NOT EXISTS daily_checkins (
      user_id INTEGER NOT NULL,
      checkin_date TEXT NOT NULL,
      stamp TEXT NOT NULL DEFAULT '',
      created_at TEXT DEFAULT (datetime('now')),
      PRIMARY KEY (user_id, checkin_date)
    );
  `);

  const { messages } = parseQqTxt(sample);
  db.run(
    `INSERT INTO import_batches (filename, message_count, time_start, time_end, created_by)
     VALUES (?, ?, ?, ?, ?)`,
    [
      "sample-rich.txt",
      messages.length,
      messages[0]?.sentAt ?? null,
      messages.at(-1)?.sentAt ?? null,
      1,
    ],
  );
  const idRow = db.exec(`SELECT id FROM import_batches ORDER BY id DESC LIMIT 1`);
  const batchId = idRow[0].values[0][0] as number;
  let quoteN = 0;
  for (const m of messages) {
    const content = desensitize(m.content);
    const isQuote =
      /一周年|金句|生日快乐|建群啦|修仙/.test(m.content) ? 1 : 0;
    if (isQuote) quoteN += 1;
    db.run(
      `INSERT INTO chat_messages (batch_id, sender, qq_number, sent_at, content, content_raw, is_quote)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [batchId, m.sender, m.qq, m.sentAt, content, m.content, isQuote],
    );
  }
  fs.writeFileSync(DB_PATH, Buffer.from(db.export()));
  console.log(`样本导入完成：${messages.length} 条，批次 #${batchId}，金句标记 ${quoteN}`);
  console.log("脱敏检查：手机号/链接应被替换；[图片] 不计名册票");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
