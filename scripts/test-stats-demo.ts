/**
 * 对真实 app.db 跑趣味统计，断言深夜指数与话痨榜可用。
 */
import assert from "assert";
import path from "path";
import fs from "fs";

// 通过动态 import 走 tsx + 路径：直接复用 sql 查询逻辑过重，改为内联等价校验
import initSqlJs from "sql.js";
import { isCountableTextMessage } from "../src/lib/chat-parser";
import { isNightOwlHour, nightOwlRatio } from "../src/lib/stats-rules";

async function main() {
  const DB_PATH = path.join(process.cwd(), "data", "app.db");
  if (!fs.existsSync(DB_PATH)) throw new Error("缺少 app.db");
  const SQL = await initSqlJs({
    locateFile: (file) =>
      path.join(process.cwd(), "node_modules", "sql.js", "dist", file),
  });
  const db = new SQL.Database(fs.readFileSync(DB_PATH));
  const talk = db.exec(
    `SELECT sender, COUNT(*) as cnt FROM chat_messages m
     JOIN import_batches b ON b.id = m.batch_id
     WHERE b.status = 'active' GROUP BY sender ORDER BY cnt DESC LIMIT 5`,
  );
  assert.ok(talk[0]?.values?.length, "话痨榜应有数据");
  console.log("== test-stats-demo ==");
  console.log(
    "话痨 Top:",
    talk[0].values.map((r) => `${r[0]}=${r[1]}`).join(", "),
  );

  const hours = db.exec(
    `SELECT substr(sent_at, 12, 2) as hour, COUNT(*) as cnt
     FROM chat_messages m
     JOIN import_batches b ON b.id = m.batch_id
     WHERE b.status = 'active' AND sent_at IS NOT NULL AND length(sent_at) >= 13
     GROUP BY hour`,
  );
  let night = 0;
  let withTime = 0;
  if (hours[0]) {
    for (const row of hours[0].values) {
      const h = Number(row[0]);
      const c = Number(row[1]);
      withTime += c;
      if (isNightOwlHour(h)) night += c;
    }
  }
  const pct = nightOwlRatio(night, withTime);
  assert.ok(withTime > 0, "应有带时间戳消息");
  // 样本里含 00:12 / 01:22 / 06:06 等，深夜应 > 0
  assert.ok(night > 0, "样本应含深夜发言");
  console.log(`  ✓ 深夜 ${night}/${withTime} = ${pct}%`);

  // 媒体不计票抽检
  assert.strictEqual(isCountableTextMessage("[图片]"), false);
  console.log("趣味统计演示通过");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
