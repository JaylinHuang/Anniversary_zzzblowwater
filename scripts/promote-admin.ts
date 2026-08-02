import fs from "fs";
import path from "path";
import initSqlJs from "sql.js";

async function main() {
  const DB_PATH = path.join(process.cwd(), "data", "app.db");
  const SQL = await initSqlJs({
    locateFile: (f) => path.join(process.cwd(), "node_modules/sql.js/dist", f),
  });
  const db = new SQL.Database(fs.readFileSync(DB_PATH));
  db.run(`UPDATE users SET role = 'admin' WHERE display_name = ?`, ["sr.11"]);
  const row = db.exec(
    `SELECT id, display_name, role FROM users WHERE display_name = 'sr.11'`,
  );
  fs.writeFileSync(DB_PATH, Buffer.from(db.export()));
  console.log("updated:", row[0]?.values || []);
}

main();
