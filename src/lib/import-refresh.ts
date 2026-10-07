import { getDb, rowFrom, rowsFrom, withDb } from "@/lib/db";
import { rebuildEmbeddingsForQq } from "@/lib/rag";
import { listTrackedAgentQqs, rebuildAgentPersona } from "@/lib/roster";

/** 已有分身补上「按整段群聊重炼」的标记。有值就不再在启动时重跑 */
const CATCHUP_KEY = "group_persona_at";

let catchingUp = false;

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

/**
 * 服务起来后立刻给已启用的分身重炼人设并重建向量，不用等到凌晨。
 * 只跑一次：厂夏这类早就建好的卡，也能用上当前归档。
 * 中途失败不写标记，下一分钟再试。
 */
export async function catchUpExistingAgents(): Promise<boolean> {
  if (catchingUp) return false;
  catchingUp = true;
  try {
    const db = await getDb();
    const done = rowFrom<{ value: string }>(
      db,
      `SELECT value FROM site_settings WHERE key = ?`,
      [CATCHUP_KEY],
    );
    if (done?.value) return false;
    const agents = rowsFrom<{ id: number; qq: string; display_name: string }>(
      db,
      `SELECT id, qq, display_name FROM agent_personas WHERE enabled = 1 ORDER BY id ASC`,
    );
    for (const agent of agents) {
      console.log(`[agent-train] ${agent.display_name} 按已导入群聊重炼`);
      await rebuildAgentPersona(agent.id);
      await rebuildEmbeddingsForQq(agent.qq);
    }
    const stamped = new Date().toISOString();
    await withDb((database) => {
      database.run(
        `INSERT INTO site_settings (key, value) VALUES (?, ?)
         ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
        [CATCHUP_KEY, stamped],
      );
    });
    return true;
  } finally {
    catchingUp = false;
  }
}
