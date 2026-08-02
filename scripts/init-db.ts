import { getDb } from "../src/lib/db";

async function main() {
  await getDb();
  console.log("数据库已初始化");
}

main();
