/**
 * 清空群聊归档（消息 + 导入批次），不影响用户/活动/投票等
 */
import path from "path";
import fs from "fs";
import initSqlJs from "sql.js";

const DB_PATH = path.join(process.cwd(), "data", "app.db");

async function main() {
  if (!fs.existsSync(DB_PATH)) {
    console.error("未找到", DB_PATH);
    process.exit(1);
  }
  const SQL = await initSqlJs({
    locateFile: (file) =>
      path.join(process.cwd(), "node_modules", "sql.js", "dist", file),
  });
  const db = new SQL.Database(fs.readFileSync(DB_PATH));

  const count = (sql: string) => {
    const r = db.exec(sql);
    return Number(r[0]?.values?.[0]?.[0] ?? 0);
  };

  console.log("清空前: messages =", count("SELECT COUNT(*) FROM chat_messages"));
  console.log("清空前: batches  =", count("SELECT COUNT(*) FROM import_batches"));

  db.run("DELETE FROM chat_messages");
  db.run("DELETE FROM import_batches");
  try {
    db.run("UPDATE agent_personas SET source_msg_count = 0");
  } catch {
    /* 无 Agent 表则忽略 */
  }

  fs.writeFileSync(DB_PATH, Buffer.from(db.export()));

  console.log("清空后: messages =", count("SELECT COUNT(*) FROM chat_messages"));
  console.log("清空后: batches  =", count("SELECT COUNT(*) FROM import_batches"));
  console.log("完成。请重启 npm run dev 后刷新「群聊归档」。");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
