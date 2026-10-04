/**
 * 把正在使用的 sr.11#4 改回 sr.11，旧重复档改名
 */
import fs from "fs";
import path from "path";
import initSqlJs from "sql.js";

async function main() {
  const DB_PATH = path.join(process.cwd(), "data", "app.db");
  const SQL = await initSqlJs({
    locateFile: (f) => path.join(process.cwd(), "node_modules/sql.js/dist", f),
  });
  const db = new SQL.Database(fs.readFileSync(DB_PATH));

  const sess = db.exec(
    `SELECT user_id FROM sessions ORDER BY created_at DESC LIMIT 5`,
  );
  console.log("recent session user_ids:", sess[0]?.values?.flat() || []);

  // 优先：若存在 id=4 且名为 sr.11#4，恢复为 sr.11
  const u4 = db.exec(`SELECT id, display_name FROM users WHERE id = 4`);
  const name4 = u4[0]?.values?.[0]?.[1]
    ? String(u4[0].values[0][1])
    : "";
  console.log("user #4 before:", name4);

  if (name4 === "sr.11#4" || name4.toLowerCase() === "sr.11#4") {
    db.run(`UPDATE users SET display_name = ? WHERE id = 3`, ["sr.11#3-旧"]);
    db.run(`UPDATE users SET display_name = ? WHERE id = 4`, ["sr.11"]);
  } else {
    // 兜底：任何 sr.11#4 改回，并避开冲突
    db.run(
      `UPDATE users SET display_name = 'sr.11#3-旧' WHERE id = 3 AND display_name = 'sr.11'`,
    );
    db.run(
      `UPDATE users SET display_name = 'sr.11' WHERE display_name = 'sr.11#4'`,
    );
  }

  fs.writeFileSync(DB_PATH, Buffer.from(db.export()));
  const users = db.exec(
    `SELECT id, display_name, role FROM users ORDER BY id`,
  );
  console.log("users after:");
  for (const row of users[0]?.values || []) {
    console.log(`  #${row[0]} ${row[1]} → ${row[2]}`);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
