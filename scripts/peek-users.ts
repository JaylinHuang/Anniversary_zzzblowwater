import fs from "fs";
import path from "path";
import initSqlJs from "sql.js";

async function main() {
  const SQL = await initSqlJs({
    locateFile: (f) => path.join("node_modules/sql.js/dist", f),
  });
  const db = new SQL.Database(fs.readFileSync("data/app.db"));
  const all = db.exec(`SELECT id, display_name, role FROM users ORDER BY id`);
  console.log("users:");
  for (const row of all[0]?.values || []) {
    console.log(`  #${row[0]} ${row[1]} → ${row[2]}`);
  }
  const admins = db.exec(
    `SELECT id, display_name FROM users WHERE role = 'admin'`,
  );
  console.log("admin count:", admins[0]?.values?.length ?? 0);
}

main();
