import { getDb, rowsFrom } from "../src/lib/db";

async function main() {
  const db = await getDb();
  const users = rowsFrom<{
    id: number;
    display_name: string;
    role: string;
  }>(db, `SELECT id, display_name, role FROM users ORDER BY id`);
  console.log("users:");
  for (const u of users) {
    console.log(`  #${u.id} ${u.display_name} → ${u.role}`);
  }
  const admins = users.filter((u) => u.role === "admin");
  console.log("admin count:", admins.length);
  const idx = db.exec(
    `SELECT name FROM sqlite_master WHERE type='index' AND name='idx_users_display_name_nocase'`,
  );
  console.log(
    "unique name index:",
    idx[0]?.values?.length ? "ok" : "missing",
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
