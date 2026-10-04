import { isCountableTextMessage } from "@/lib/chat-parser";
import { ragIndexPerQq, ragTopK } from "@/lib/constants";
import { getDb, rowFrom, rowsFrom, withDb } from "@/lib/db";
import {
  embedTexts,
  getEmbeddingConfig,
  isEmbeddingConfigured,
} from "@/lib/llm";

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

/** 为某 QQ 的近期可计票发言建立/刷新向量索引 */
export async function indexEmbeddingsForQq(qq: string): Promise<{
  indexed: number;
  model: string;
}> {
  if (!isEmbeddingConfigured()) {
    throw new Error("未配置 Embeddings（EMBEDDING_MODEL / LLM_API_KEY）");
  }
  const cfg = getEmbeddingConfig()!;
  const limit = ragIndexPerQq();
  const db = await getDb();
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
     ORDER BY m.sent_at DESC, m.id DESC
     LIMIT ?`,
    [qq, limit * 2],
  ).filter((r) => isCountableTextMessage(r.content)).slice(0, limit);

  if (!rows.length) {
    return { indexed: 0, model: cfg.model };
  }

  // 只补缺：已有同 model 的跳过
  const existing = new Set(
    rowsFrom<{ message_id: number }>(
      db,
      `SELECT message_id FROM chat_embeddings
       WHERE qq_number = ? AND model = ?`,
      [qq, cfg.model],
    ).map((r) => r.message_id),
  );
  const todo = rows.filter((r) => !existing.has(r.id));
  if (!todo.length) {
    return { indexed: 0, model: cfg.model };
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
          cfg.model,
          vec.length,
          JSON.stringify(vec),
          row.content.slice(0, 120),
        ],
      );
    }
  });
  return { indexed: todo.length, model: cfg.model };
}

/** 按用户问题检索该群友相关历史发言 */
export async function retrieveRagForQq(
  qq: string,
  query: string,
  topK = ragTopK(),
): Promise<RagHit[]> {
  if (!ragEnabledSafe() || !isEmbeddingConfigured()) return [];
  const q = query.trim();
  if (!q || !qq) return [];

  const cfg = getEmbeddingConfig()!;
  let count = Number(
    (
      await (async () => {
        const db = await getDb();
        return rowFrom<{ c: number }>(
          db,
          `SELECT COUNT(*) as c FROM chat_embeddings
           WHERE qq_number = ? AND model = ?`,
          [qq, cfg.model],
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
          [qq, cfg.model],
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
    [qq, cfg.model],
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
  const top = scored.slice(0, topK);
  if (!top.length) return [];

  // 取完整 content + 时间
  const ids = top.map((t) => t.messageId);
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
  return top.map((t) => {
    const f = byId.get(t.messageId);
    return {
      messageId: t.messageId,
      content: f?.content || t.content,
      sentAt: f?.sent_at ?? null,
      score: t.score,
    };
  });
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
    "以下是与当前话题相关的你在群里的历史发言摘录（仅供模仿口吻与梗，不要逐字复读隐私或攻击性内容）：",
    ...lines,
  ].join("\n");
}
