import { getDb, rowFrom, rowsFrom, withDb } from "@/lib/db";
import { rebuildEmbeddingsForQq } from "@/lib/rag";
import { listTrackedAgentQqs, rebuildAgentPersona } from "@/lib/roster";

/**
 * 新导入的批次 agent_refreshed_at 为空。
 * 已有的整份归档在加列时标过时间，凌晨不会重跑。
 */
export function trackedQqsInImport(
  messageQqs: string[],
  tracked: string[],
): string[] {
  const known = new Set(tracked.map((qq) => qq.trim()).filter(Boolean));
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of messageQqs) {
    const qq = raw.trim();
    if (!qq || !known.has(qq) || seen.has(qq)) continue;
    seen.add(qq);
    out.push(qq);
  }
  return out;
}

/**
 * 凌晨跟进：导入时已经洗过并写进归档。
 * 这里只对批次里出现过的已绑定分身重炼人设、重建向量。
 * 没有新批次就什么都不做。任一步失败就留着批次，下一晚再试。
 */
export async function refreshImportedAgents(): Promise<{
  batches: number;
  agents: number;
  embedded: number;
}> {
  const db = await getDb();
  const batches = rowsFrom<{ id: number }>(
    db,
    `SELECT id FROM import_batches
     WHERE status = 'active' AND agent_refreshed_at IS NULL
     ORDER BY id ASC`,
  );
  if (!batches.length) return { batches: 0, agents: 0, embedded: 0 };

  const ids = batches.map((row) => row.id);
  const qqRows = rowsFrom<{ qq_number: string }>(
    db,
    `SELECT DISTINCT qq_number AS qq_number FROM chat_messages
     WHERE batch_id IN (${ids.map(() => "?").join(", ")})
       AND qq_number IS NOT NULL AND qq_number != ''`,
    ids,
  );
  const qqs = trackedQqsInImport(
    qqRows.map((row) => row.qq_number),
    await listTrackedAgentQqs(),
  );

  let embedded = 0;
  for (const qq of qqs) {
    const agent = rowFrom<{ id: number }>(
      db,
      `SELECT id FROM agent_personas WHERE qq = ? AND enabled = 1`,
      [qq],
    );
    if (!agent) continue;
    await rebuildAgentPersona(agent.id);
    const result = await rebuildEmbeddingsForQq(qq);
    embedded += result.indexed;
  }

  const stamped = new Date().toISOString();
  await withDb((database) => {
    for (const id of ids) {
      database.run(
        `UPDATE import_batches
         SET agent_refreshed_at = ?
         WHERE id = ? AND agent_refreshed_at IS NULL`,
        [stamped, id],
      );
    }
  });
  return { batches: ids.length, agents: qqs.length, embedded };
}
