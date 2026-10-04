/**
 * 给已有昵称绑定 QQ：npx tsx scripts/bind-qq.ts sr.11 2810745803
 */
import fs from "fs";
import path from "path";
import initSqlJs from "sql.js";
import { normalizeQq } from "../src/lib/qq-verify";

async function main() {
  const name = (process.argv[2] || "").trim();
  const qq = normalizeQq(process.argv[3] || "");
  if (!name || !qq) {
    console.error("用法: npx tsx scripts/bind-qq.ts <昵称> <QQ号>");
    process.exit(1);
  }

  const DB_PATH = path.join(process.cwd(), "data", "app.db");
  const SQL = await initSqlJs({
    locateFile: (f) => path.join(process.cwd(), "node_modules/sql.js/dist", f),
  });
  const db = new SQL.Database(fs.readFileSync(DB_PATH));

  const occupied = db.exec(
    `SELECT id, display_name FROM users WHERE qq_number = '${qq}'`,
  );
  if (occupied[0]?.values?.length) {
    const row = occupied[0].values[0];
    console.error(`QQ 已被 #${row[0]} ${row[1]} 占用`);
    process.exit(1);
  }

  const user = db.exec(
    `SELECT id, display_name, qq_number, role FROM users WHERE display_name = '${name.replace(/'/g, "''")}' COLLATE NOCASE`,
  );
  if (!user[0]?.values?.length) {
    console.error(`未找到昵称 ${name}`);
    process.exit(1);
  }
  const id = Number(user[0].values[0][0]);
  db.run(`UPDATE users SET qq_number = ? WHERE id = ?`, [qq, id]);
  fs.writeFileSync(DB_PATH, Buffer.from(db.export()));
  console.log(`已绑定: #${id} ${name} ← QQ ${qq}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
