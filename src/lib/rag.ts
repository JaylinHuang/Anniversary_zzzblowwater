import { BOT_GROUP_NAMES, isBotGroupName } from "@/lib/bot-chat";
import { isAgentCorpusText } from "@/lib/chat-parser";
import { ragIndexPerQq, ragTopK } from "@/lib/constants";
import { getDb, rowFrom, rowsFrom, withDb } from "@/lib/db";
import { embedTexts, resolveEmbedBackend } from "@/lib/llm";
import { normalizeText, rerankHits } from "@/lib/rag-rerank";

function cosine(a: number[], b: number[]): number {
  let dot = 0;
  let na = 0;
  let nb = 0;
  const n = Math.min(a.length, b.length);
  for (let i = 0; i < n; i++) {
    dot += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  if (na === 0 || nb === 0) return 0;
  return dot / (Math.sqrt(na) * Math.sqrt(nb));
}

export type RagHit = {
  messageId: number;
  content: string;
  sentAt: string | null;
  score: number;
};

/** 本地索引覆盖全年，云端仍按条数上限控制费用 */
let botEmbeddingsPurged = false;

/** 删掉机器人自己的向量。不做全文 LIKE，那会把整库扫进内存 */
async function purgeBotEmbeddings(): Promise<void> {
  if (botEmbeddingsPurged) return;
  botEmbeddingsPurged = true;
  const nameSlots = BOT_GROUP_NAMES.map(() => "?").join(", ");
  try {
    await withDb((db) => {
      db.run(
        `DELETE FROM chat_embeddings WHERE qq_number IN (
           SELECT DISTINCT qq_number FROM chat_messages
           WHERE sender IN (${nameSlots})
             AND qq_number IS NOT NULL AND qq_number != ''
         )`,
        [...BOT_GROUP_NAMES],
      );
    });
  } catch {
    /* 清不掉也不要挡住建索引 */
  }
}

/** 为某 QQ 的发言建立/刷新向量索引 */
export async function indexEmbeddingsForQq(qq: string): Promise<{
  indexed: number;
  model: string;
  local: boolean;
}> {
  const backend = await resolveEmbedBackend();
  await purgeBotEmbeddings();
  const db = await getDb();
  const botSpeaker = rowFrom<{ sender: string }>(
    db,
    `SELECT sender FROM chat_messages
     WHERE qq_number = ? AND sender IN (${BOT_GROUP_NAMES.map(() => "?").join(", ")})
     LIMIT 1`,
    [qq, ...BOT_GROUP_NAMES],
  );
  if (botSpeaker || isBotGroupName(qq)) {
    return { indexed: 0, model: backend.model, local: backend.local };
  }
  // 只取最近一小段。按时间倒序读进来，筛掉机器人腔之后再截断，避免一次载入全部发言
  const cap = Math.min(ragIndexPerQq(), 400);
  const rows = rowsFrom<{
    id: number;
    content: string;
    sent_at: string | null;
  }>(
    db,
    `SELECT m.id, m.content, m.sent_at
     FROM chat_messages m
     JOIN import_batches b ON b.id = m.batch_id
     WHERE b.status = 'active' AND m.qq_number = ?
     ORDER BY m.id DESC
     LIMIT ?`,
    [qq, cap * 2],
  )
    .filter((r) => isAgentCorpusText(r.content))
    .slice(0, cap);
  const uniqueRows = dedupeIndexRows(rows);

  if (!uniqueRows.length) {
    return { indexed: 0, model: backend.model, local: backend.local };
  }

  // 只补缺：已有同 model 的跳过
  const existing = new Set(
    rowsFrom<{ message_id: number }>(
      db,
      `SELECT message_id FROM chat_embeddings
       WHERE qq_number = ? AND model = ?`,
      [qq, backend.model],
    ).map((r) => r.message_id),
  );
  const todo = uniqueRows.filter((r) => !existing.has(r.id));
  if (!todo.length) {
    return { indexed: 0, model: backend.model, local: backend.local };
  }

  const vectors = await embedTexts(todo.map((r) => r.content));
  await withDb((db2) => {
    for (let i = 0; i < todo.length; i++) {
      const row = todo[i];
      const vec = vectors[i];
      db2.run(
        `INSERT OR REPLACE INTO chat_embeddings
         (message_id, qq_number, model, dims, vector_json, content_preview, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, datetime('now'))`,
        [
          row.id,
          qq,
          backend.model,
          vec.length,
          JSON.stringify(vec),
          row.content.slice(0, 120),
        ],
      );
    }
  });
  return { indexed: todo.length, model: backend.model, local: backend.local };
}

/** 和管理员以前点的「重建向量索引」同一条路：清掉该模型的旧向量，再按近期发言重建 */
export async function rebuildEmbeddingsForQq(qq: string): Promise<{
  indexed: number;
  model: string;
  local: boolean;
}> {
  const backend = await resolveEmbedBackend();
  await withDb((db) => {
    db.run(`DELETE FROM chat_embeddings WHERE qq_number = ? AND model = ?`, [
      qq,
      backend.model,
    ]);
  });
  return indexEmbeddingsForQq(qq);
}

/** 按用户问题检索该群友相关历史发言 */
export async function retrieveRagForQq(
  qq: string,
  query: string,
  topK = ragTopK(),
): Promise<RagHit[]> {
  if (!ragEnabledSafe()) return [];
  const q = query.trim();
  if (!q || !qq) return [];
  if (isBotGroupName(qq)) return [];

  await purgeBotEmbeddings();
  const backend = await resolveEmbedBackend();
  let count = Number(
    (
      await (async () => {
        const db = await getDb();
        return rowFrom<{ c: number }>(
          db,
          `SELECT COUNT(*) as c FROM chat_embeddings
           WHERE qq_number = ? AND model = ?`,
          [qq, backend.model],
        );
      })()
    )?.c ?? 0,
  );

  // 冷启动：首次对话时自动建一小批索引
  if (count === 0) {
    try {
      await indexEmbeddingsForQq(qq);
      const db = await getDb();
      count = Number(
        rowFrom<{ c: number }>(
          db,
          `SELECT COUNT(*) as c FROM chat_embeddings
           WHERE qq_number = ? AND model = ?`,
          [qq, backend.model],
        )?.c ?? 0,
      );
    } catch {
      return [];
    }
  }
  if (count === 0) return [];

  const [queryVec] = await embedTexts([q]);
  const db = await getDb();
  const stored = rowsFrom<{
    message_id: number;
    vector_json: string;
    content_preview: string;
  }>(
    db,
    `SELECT message_id, vector_json, content_preview
     FROM chat_embeddings WHERE qq_number = ? AND model = ?`,
    [qq, backend.model],
  );

  const scored: RagHit[] = [];
  for (const row of stored) {
    let vec: number[];
    try {
      vec = JSON.parse(row.vector_json) as number[];
    } catch {
      continue;
    }
    const score = cosine(queryVec, vec);
    scored.push({
      messageId: row.message_id,
      content: row.content_preview,
      sentAt: null,
      score,
    });
  }
  scored.sort((a, b) => b.score - a.score);
  const pool = scored.slice(0, Math.max(topK * 6, topK));
  if (!pool.length) return [];

  const ids = pool.map((t) => t.messageId);
  const placeholders = ids.map(() => "?").join(",");
  const full = rowsFrom<{
    id: number;
    content: string;
    sent_at: string | null;
  }>(
    db,
    `SELECT id, content, sent_at FROM chat_messages WHERE id IN (${placeholders})`,
    ids,
  );
  const byId = new Map(full.map((f) => [f.id, f]));
  return rerankHits(
    q,
    pool.map((t) => {
      const row = byId.get(t.messageId);
      return {
        messageId: t.messageId,
        content: row?.content || t.content,
        sentAt: row?.sent_at ?? null,
        vectorScore: t.score,
      };
    }),
    topK,
  ).map((hit) => ({
    messageId: hit.messageId,
    content: hit.content,
    sentAt: hit.sentAt,
    score: hit.vectorScore,
  }));
}

/** 同一句规范化后只保留时间更晚的一条，避免重复脏数据进索引 */
function dedupeIndexRows<T extends { content: string; sent_at: string | null }>(
  rows: T[],
): T[] {
  const kept = new Map<string, T>();
  for (const row of rows) {
    const key = normalizeText(row.content);
    if (!key) continue;
    const prev = kept.get(key);
    if (!prev || (row.sent_at || "") >= (prev.sent_at || "")) {
      kept.set(key, row);
    }
  }
  return [...kept.values()];
}

function ragEnabledSafe() {
  const v = (process.env.RAG_ENABLED || "1").trim().toLowerCase();
  return v !== "0" && v !== "false" && v !== "off";
}

export function formatRagBlock(hits: RagHit[]): string {
  if (!hits.length) return "";
  const lines = hits.map((h, i) => {
    const when = h.sentAt ? `（${h.sentAt}）` : "";
    return `${i + 1}. ${when}${h.content.slice(0, 200)}`;
  });
  return [
    "以下是你自己说过的话，用来回忆态度和事实。问看法时用你的口气回答，不要整句贴回去；没写过的时间、数字、人名和原因不要补。相似句已合并，互相矛盾的旧说法已去掉：",
    ...lines,
  ].join("\n");
}
