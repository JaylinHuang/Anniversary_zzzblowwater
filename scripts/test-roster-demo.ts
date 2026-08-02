/**
 * 基于真实 app.db 归档，验证名册计票 + 基线规则是否符合预期。
 * 不调用 LLM、不写入名册。
 */
import assert from "assert";
import fs from "fs";
import path from "path";
import initSqlJs from "sql.js";
import { isCountableTextMessage } from "../src/lib/chat-parser";
import {
  pickBaselineRoster,
  selectAdmissions,
} from "../src/lib/roster-rules";

async function main() {
  const DB_PATH = path.join(process.cwd(), "data", "app.db");
  if (!fs.existsSync(DB_PATH)) {
    throw new Error("缺少 data/app.db，请先启动应用或导入样本");
  }
  const SQL = await initSqlJs({
    locateFile: (file) =>
      path.join(process.cwd(), "node_modules", "sql.js", "dist", file),
  });
  const db = new SQL.Database(fs.readFileSync(DB_PATH));
  const res = db.exec(
    `SELECT m.qq_number, m.sender, m.content
     FROM chat_messages m
     JOIN import_batches b ON b.id = m.batch_id
     WHERE b.status = 'active' AND m.qq_number IS NOT NULL AND m.qq_number != ''`,
  );
  const map = new Map<string, { displayName: string; textCount: number }>();
  if (res[0]) {
    for (const row of res[0].values) {
      const qq = String(row[0]);
      const sender = String(row[1]);
      const content = String(row[2]);
      if (!isCountableTextMessage(content)) continue;
      const cur = map.get(qq);
      if (!cur) map.set(qq, { displayName: sender, textCount: 1 });
      else {
        cur.textCount += 1;
        cur.displayName = sender;
      }
    }
  }
  const ranked = [...map.entries()]
    .map(([qq, v]) => ({ qq, displayName: v.displayName, textCount: v.textCount }))
    .sort((a, b) => {
      if (b.textCount !== a.textCount) return b.textCount - a.textCount;
      return a.qq.localeCompare(b.qq, "en");
    });

  console.log("== test-roster-demo ==");
  console.log(
    "发言榜:",
    ranked.map((r) => `${r.displayName}(${r.qq})=${r.textCount}`).join(", "),
  );
  assert.ok(ranked.length >= 3, "样本至少应有 3 个带 QQ 的发言人");

  const { picked, threshold } = pickBaselineRoster(ranked, 3, 40);
  assert.strictEqual(picked.length, 3);
  assert.ok(threshold > 0);
  console.log(
    `  ✓ 基线 Top3 → threshold*=${threshold} · ${picked.map((p) => p.qq).join(",")}`,
  );

  // 模拟：等于阈值不进；若有人严格大于则应被选中
  const admitted = selectAdmissions(ranked, {
    threshold,
    softCap: 40,
    existingQqs: picked.map((p) => p.qq),
    currentEnabledCount: picked.length,
  });
  for (const a of admitted) {
    assert.ok(a.textCount > threshold);
  }
  console.log(`  ✓ 增量候选 ${admitted.length} 人（皆 > threshold*）`);
  console.log("名册演示用例通过");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
