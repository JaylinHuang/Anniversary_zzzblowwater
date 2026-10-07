/**
 * 分层记忆的存储层。借 Letta 的分法：
 * - 短期：当前对话窗口，由调用方带进上下文；超窗口压成一条长期摘要
 * - 长期：agent_user_memory，按 (分身 id, 网站用户 id) 隔离，靠检索拿回来
 * - 工作：agent_working_memory，只属于当前用户的当前一轮
 *
 * sql.js 的写入是同步回调，每次 persist 都要写整个库文件。
 * 所以这里全部做成同步函数，由调用方攒完一轮再落一次盘。
 */
import type { Database } from "sql.js";
import { getDb, rowFrom, rowsFrom } from "@/lib/db";
import { embedTexts } from "@/lib/llm";
import {
  ageInDays,
  compact,
  decayedImportance,
  memoryTopic,
  rankMemories,
  refineTopic,
  type MemoryItem,
  type MemoryKind,
  type ScoredMemory,
} from "@/lib/memory-score";

/** 一轮里最多留多少条工作记忆，超出的丢掉最早的 */
export const WORKING_NOTE_LIMIT = 24;
/** 每个 (分身, 用户) 最多留多少条长期记忆行 */
export const MEMORY_ROW_LIMIT = 200;

export type StoredMemory = MemoryItem & {
  agentId: number;
  userId: number;
  hitCount: number;
  supersededBy: number | null;
  createdAt: string;
  lastHitAt: string | null;
};

type MemoryRow = {
  id: number;
  agent_id: number;
  user_id: number;
  topic: string;
  fact: string;
  kind: string;
  importance: number;
  hit_count: number;
  vector_json: string | null;
  superseded_by: number | null;
  last_hit_at: string | null;
  created_at: string;
  updated_at: string;
};

/** 和 SQLite datetime('now') 同口径：UTC 的 'YYYY-MM-DD HH:MM:SS' */
export function sqlNow(now: Date = new Date()): string {
  return now.toISOString().slice(0, 19).replace("T", " ");
}

function parseVector(json: string | null): number[] | null {
  if (!json) return null;
  try {
    const arr = JSON.parse(json) as unknown;
    if (!Array.isArray(arr) || !arr.length) return null;
    return arr.map((v) => Number(v));
  } catch {
    return null;
  }
}

function mapRow(row: MemoryRow): StoredMemory {
  return {
    id: Number(row.id),
    agentId: Number(row.agent_id),
    userId: Number(row.user_id),
    topic: String(row.topic || ""),
    fact: String(row.fact || ""),
    kind: (row.kind === "summary" ? "summary" : "fact") as MemoryKind,
    importance: Number(row.importance),
    hitCount: Number(row.hit_count || 0),
    vector: parseVector(row.vector_json),
    supersededBy: row.superseded_by === null ? null : Number(row.superseded_by),
    superseded: row.superseded_by !== null,
    createdAt: String(row.created_at || ""),
    lastHitAt: row.last_hit_at === null ? null : String(row.last_hit_at),
    updatedAt: String(row.updated_at || ""),
  };
}

/** 这位用户在这个分身名下的全部记忆行，含已被取代的（给维护和自测看） */
export function loadAllMemoriesSync(
  db: Database,
  agentId: number,
  userId: number,
): StoredMemory[] {
  if (userId <= 0) return [];
  return rowsFrom<MemoryRow>(
    db,
    `SELECT * FROM agent_user_memory
     WHERE agent_id = ? AND user_id = ?
     ORDER BY id ASC`,
    [agentId, userId],
  ).map(mapRow);
}

/** 仍然有效的记忆行。被取代的不在里面 */
export function loadActiveMemoriesSync(
  db: Database,
  agentId: number,
  userId: number,
): StoredMemory[] {
  if (userId <= 0) return [];
  return rowsFrom<MemoryRow>(
    db,
    `SELECT * FROM agent_user_memory
     WHERE agent_id = ? AND user_id = ? AND superseded_by IS NULL
     ORDER BY id ASC`,
    [agentId, userId],
  ).map(mapRow);
}

export type RememberInput = {
  agentId: number;
  /** 必须是确定的网站用户。0 或负数表示分不清对面是谁，这时一个字都不写 */
  userId: number;
  fact: string;
  topic?: string;
  importance?: number;
  kind?: MemoryKind;
  vector?: number[] | null;
  now?: Date;
};

export type RememberResult = {
  saved: boolean;
  id: number;
  /** 被这条新事实取代的旧行 */
  replaced: number[];
  reason?: string;
};

/**
 * 写一条或覆盖一条。
 * 同一主题的旧事实就地标记被取代，禁止两条同时有效。
 */
export function rememberSync(
  db: Database,
  input: RememberInput,
): RememberResult {
  const stamp = sqlNow(input.now ?? new Date());
  const fact = (input.fact || "").replace(/\s+/g, " ").trim().slice(0, 180);
  if (input.userId <= 0) {
    return { saved: false, id: 0, replaced: [], reason: "对面身份没确认" };
  }
  if (compact(fact).length < 2) {
    return { saved: false, id: 0, replaced: [], reason: "没有可记的内容" };
  }
  // 粗主题（如模型随手填的「身体忌讳」）先细分到具体对象，
  // 否则不矛盾的两件事会因为同属一个大类而互相取代
  const topic = (
    input.topic ? refineTopic(input.topic, fact) : memoryTopic(fact)
  ).slice(0, 60);
  const kind: MemoryKind = input.kind === "summary" ? "summary" : "fact";
  const importance = Math.min(1, Math.max(0, input.importance ?? 0.35));
  const vectorJson = input.vector?.length ? JSON.stringify(input.vector) : "";

  // 同一句话再说一遍：只抬重要性和时间，不叠新行
  const same = rowsFrom<MemoryRow>(
    db,
    `SELECT * FROM agent_user_memory
     WHERE agent_id = ? AND user_id = ? AND superseded_by IS NULL`,
    [input.agentId, input.userId],
  ).find((row) => compact(String(row.fact)) === compact(fact));
  if (same) {
    db.run(
      `UPDATE agent_user_memory
       SET importance = ?, topic = ?, kind = ?, updated_at = ?,
           vector_json = CASE WHEN ? = '' THEN vector_json ELSE ? END
       WHERE id = ?`,
      [
        Math.max(Number(same.importance), importance),
        topic,
        kind,
        stamp,
        vectorJson,
        vectorJson,
        Number(same.id),
      ],
    );
    return { saved: true, id: Number(same.id), replaced: [] };
  }

  db.run(
    `INSERT INTO agent_user_memory
       (agent_id, user_id, topic, fact, kind, importance, hit_count,
        vector_json, superseded_by, last_hit_at, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, 0, ?, NULL, NULL, ?, ?)`,
    [
      input.agentId,
      input.userId,
      topic,
      fact,
      kind,
      importance,
      vectorJson,
      stamp,
      stamp,
    ],
  );
  const newId = Number(
    rowFrom<{ id: number }>(db, `SELECT last_insert_rowid() as id`)?.id ?? 0,
  );

  // 冲突即更新：同主题的旧事实不再被检索到
  const olders = rowsFrom<{ id: number }>(
    db,
    `SELECT id FROM agent_user_memory
     WHERE agent_id = ? AND user_id = ? AND topic = ?
       AND superseded_by IS NULL AND id != ?`,
    [input.agentId, input.userId, topic, newId],
  ).map((row) => Number(row.id));
  for (const oldId of olders) {
    db.run(
      `UPDATE agent_user_memory
       SET superseded_by = ?, updated_at = ?
       WHERE id = ?`,
      [newId, stamp, oldId],
    );
  }
  pruneMemoryRowsSync(db, input.agentId, input.userId);
  return { saved: true, id: newId, replaced: olders };
}

/** 会话摘要允许的最长字数。比普通事实长，因为要装下累积的关键数字和约束 */
export const SESSION_SUMMARY_MAX_CHARS = 400;

/** 一个会话在长期记忆里对应的摘要主题，同一会话永远只用这一个主题 */
export function sessionSummaryTopic(sessionId: number): string {
  return `会话摘要:${sessionId}`;
}

/** 整理成会话摘要实际落库的样子：压空白、截到上限 */
export function normalizeSessionSummary(text: string): string {
  return (text || "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, SESSION_SUMMARY_MAX_CHARS);
}

/** 这个会话当前有效的摘要行，没有就返回 null */
export function findSessionSummarySync(
  db: Database,
  params: { agentId: number; userId: number; sessionId: number },
): StoredMemory | null {
  if (params.userId <= 0 || params.sessionId <= 0) return null;
  const row = rowFrom<MemoryRow>(
    db,
    `SELECT * FROM agent_user_memory
     WHERE agent_id = ? AND user_id = ? AND kind = 'summary'
       AND topic = ? AND superseded_by IS NULL
     ORDER BY id DESC LIMIT 1`,
    [params.agentId, params.userId, sessionSummaryTopic(params.sessionId)],
  );
  return row ? mapRow(row) : null;
}

/**
 * 写会话摘要：已有有效摘要就地改那一行，没有才插入新行。
 * 这样同一会话里有效的摘要始终只有一条，措辞再变也不会叠出新行。
 */
export function upsertSessionSummarySync(
  db: Database,
  input: {
    agentId: number;
    userId: number;
    sessionId: number;
    fact: string;
    importance: number;
    vector?: number[] | null;
    now?: Date;
  },
): { saved: boolean; id: number; inPlace: boolean } {
  if (input.userId <= 0 || input.sessionId <= 0) {
    return { saved: false, id: 0, inPlace: false };
  }
  const fact = normalizeSessionSummary(input.fact);
  if (compact(fact).length < 2) return { saved: false, id: 0, inPlace: false };
  const stamp = sqlNow(input.now ?? new Date());
  const existing = findSessionSummarySync(db, input);
  if (!existing) {
    // 不走 rememberSync：它按 180 字截断，会把摘要尾部的数字截掉
    db.run(
      `INSERT INTO agent_user_memory
         (agent_id, user_id, topic, fact, kind, importance, hit_count,
          vector_json, superseded_by, last_hit_at, created_at, updated_at)
       VALUES (?, ?, ?, ?, 'summary', ?, 0, ?, NULL, NULL, ?, ?)`,
      [
        input.agentId,
        input.userId,
        sessionSummaryTopic(input.sessionId),
        fact,
        input.importance,
        input.vector?.length ? JSON.stringify(input.vector) : "",
        stamp,
        stamp,
      ],
    );
    const newId = Number(
      rowFrom<{ id: number }>(db, `SELECT last_insert_rowid() as id`)?.id ?? 0,
    );
    pruneMemoryRowsSync(db, input.agentId, input.userId);
    return { saved: true, id: newId, inPlace: false };
  }
  // 旧向量对应旧措辞，新向量拿不到时清空，让打分退回关键词那一路
  db.run(
    `UPDATE agent_user_memory
     SET fact = ?, importance = ?, vector_json = ?, updated_at = ?
     WHERE id = ? AND agent_id = ? AND user_id = ?`,
    [
      fact,
      input.importance,
      input.vector?.length ? JSON.stringify(input.vector) : "",
      stamp,
      existing.id,
      input.agentId,
      input.userId,
    ],
  );
  return { saved: true, id: existing.id, inPlace: true };
}

/** 这个会话已经压到哪条消息（含）。没有记录就是 0，同一会话只认自己的用户和分身 */
export function getCompressedUptoSync(
  db: Database,
  params: { sessionId: number; userId: number; agentId: number },
): number {
  if (params.userId <= 0 || params.sessionId <= 0) return 0;
  return Number(
    rowFrom<{ compressed_upto_id: number }>(
      db,
      `SELECT compressed_upto_id FROM agent_dm_window
       WHERE session_id = ? AND user_id = ? AND agent_id = ?`,
      [params.sessionId, params.userId, params.agentId],
    )?.compressed_upto_id ?? 0,
  );
}

/** 抬高水位。只升不降，别的用户占着的会话号一律不写 */
export function setCompressedUptoSync(
  db: Database,
  params: {
    sessionId: number;
    userId: number;
    agentId: number;
    uptoId: number;
    now?: Date;
  },
) {
  if (params.userId <= 0 || params.sessionId <= 0) return;
  const stamp = sqlNow(params.now ?? new Date());
  const row = rowFrom<{ user_id: number; agent_id: number }>(
    db,
    `SELECT user_id, agent_id FROM agent_dm_window WHERE session_id = ?`,
    [params.sessionId],
  );
  if (!row) {
    db.run(
      `INSERT INTO agent_dm_window
         (session_id, user_id, agent_id, compressed_upto_id, updated_at)
       VALUES (?, ?, ?, ?, ?)`,
      [params.sessionId, params.userId, params.agentId, params.uptoId, stamp],
    );
    return;
  }
  if (
    Number(row.user_id) !== params.userId ||
    Number(row.agent_id) !== params.agentId
  ) {
    return;
  }
  db.run(
    `UPDATE agent_dm_window
     SET compressed_upto_id = MAX(compressed_upto_id, ?), updated_at = ?
     WHERE session_id = ? AND user_id = ? AND agent_id = ?`,
    [params.uptoId, stamp, params.sessionId, params.userId, params.agentId],
  );
}

/** 行数到顶时，丢掉最早的已被取代的行 */
export function pruneMemoryRowsSync(
  db: Database,
  agentId: number,
  userId: number,
) {
  const total = Number(
    rowFrom<{ c: number }>(
      db,
      `SELECT COUNT(*) as c FROM agent_user_memory
       WHERE agent_id = ? AND user_id = ?`,
      [agentId, userId],
    )?.c ?? 0,
  );
  if (total <= MEMORY_ROW_LIMIT) return;
  db.run(
    `DELETE FROM agent_user_memory
     WHERE id IN (
       SELECT id FROM agent_user_memory
       WHERE agent_id = ? AND user_id = ?
       ORDER BY (superseded_by IS NULL) ASC, importance ASC, id ASC
       LIMIT ?
     )`,
    [agentId, userId, total - MEMORY_ROW_LIMIT],
  );
}

export type SearchMemoryInput = {
  agentId: number;
  userId: number;
  query: string;
  queryVector?: number[] | null;
  limit?: number;
  now?: Date;
  /** 命中后记一次检索，用来判断哪些记忆长期没人要 */
  touch?: boolean;
};

/**
 * 只查这位用户在这个分身名下的长期记忆。
 * 换一个网站用户就查不到，分不清对面是谁时直接空手回。
 */
export function searchMemorySync(
  db: Database,
  input: SearchMemoryInput,
): ScoredMemory[] {
  if (input.userId <= 0) return [];
  const now = input.now ?? new Date();
  const items = loadActiveMemoriesSync(db, input.agentId, input.userId);
  const hits = rankMemories({
    query: input.query || "",
    items,
    now,
    queryVector: input.queryVector ?? null,
    limit: input.limit ?? 5,
  });
  if (input.touch !== false && hits.length) {
    const stamp = sqlNow(now);
    for (const hit of hits) {
      db.run(
        `UPDATE agent_user_memory
         SET hit_count = hit_count + 1, last_hit_at = ?
         WHERE id = ?`,
        [stamp, hit.id],
      );
    }
  }
  return hits;
}

/** 长期没被检索的降权。门槛以下的靠打分自然排不进结果，不删行 */
export function decayUnusedSync(
  db: Database,
  params: { agentId: number; userId: number; now?: Date },
): number {
  const now = params.now ?? new Date();
  const rows = loadActiveMemoriesSync(db, params.agentId, params.userId);
  let changed = 0;
  for (const row of rows) {
    const days = ageInDays(row.lastHitAt || row.createdAt, now);
    const next = decayedImportance(row.importance, days);
    if (Math.abs(next - row.importance) < 1e-6) continue;
    db.run(`UPDATE agent_user_memory SET importance = ? WHERE id = ?`, [
      next,
      row.id,
    ]);
    changed++;
  }
  return changed;
}

/**
 * 空闲归并去重：同原文、同主题的多条只留最新一条，其余标记被取代。
 * 做成普通函数，在一轮结束时调一次，不挂定时器。
 */
export function mergeDuplicatesSync(
  db: Database,
  params: { agentId: number; userId: number; now?: Date },
): number {
  const now = params.now ?? new Date();
  const stamp = sqlNow(now);
  const rows = loadActiveMemoriesSync(db, params.agentId, params.userId);
  const groups = new Map<string, StoredMemory[]>();
  for (const row of rows) {
    const byText = `文:${compact(row.fact)}`;
    push(groups, byText, row);
    // 原文指纹类主题只代表「还没归类」，不参与同主题合并
    if (row.topic && !row.topic.startsWith("原文:")) {
      push(groups, `题:${row.kind}:${row.topic}`, row);
    }
  }
  const dropped = new Set<number>();
  for (const list of groups.values()) {
    if (list.length < 2) continue;
    const sorted = [...list].sort((a, b) => {
      if (a.updatedAt !== b.updatedAt) return a.updatedAt < b.updatedAt ? 1 : -1;
      return b.id - a.id;
    });
    const keep = sorted[0];
    for (const row of sorted.slice(1)) {
      if (row.id === keep.id || dropped.has(row.id)) continue;
      dropped.add(row.id);
      db.run(
        `UPDATE agent_user_memory
         SET superseded_by = ?, updated_at = ?
         WHERE id = ?`,
        [keep.id, stamp, row.id],
      );
    }
  }
  return dropped.size;
}

function push<T>(map: Map<string, T[]>, key: string, value: T) {
  const list = map.get(key);
  if (list) list.push(value);
  else map.set(key, [value]);
}

export type WorkingNote = {
  id: number;
  step: number;
  tool: string;
  note: string;
  createdAt: string;
};

/** 记下这一轮查过什么、用了哪个工具、走到第几步 */
export function noteWorkingSync(
  db: Database,
  params: {
    turnId: string;
    agentId: number;
    userId: number;
    step: number;
    tool?: string;
    note: string;
    now?: Date;
  },
) {
  const note = (params.note || "").replace(/\s+/g, " ").trim().slice(0, 300);
  if (!note) return;
  db.run(
    `INSERT INTO agent_working_memory
       (turn_id, agent_id, user_id, step, tool, note, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [
      params.turnId,
      params.agentId,
      params.userId,
      Math.max(0, Math.floor(params.step)),
      (params.tool || "").slice(0, 40),
      note,
      sqlNow(params.now ?? new Date()),
    ],
  );
  db.run(
    `DELETE FROM agent_working_memory
     WHERE turn_id = ? AND id NOT IN (
       SELECT id FROM agent_working_memory
       WHERE turn_id = ? ORDER BY id DESC LIMIT ?
     )`,
    [params.turnId, params.turnId, WORKING_NOTE_LIMIT],
  );
}

/** 工作记忆只属于当前用户的当前一轮，换个用户读不到 */
export function listWorkingNotesSync(
  db: Database,
  params: { turnId: string; userId: number },
): WorkingNote[] {
  if (params.userId <= 0) return [];
  return rowsFrom<{
    id: number;
    step: number;
    tool: string;
    note: string;
    created_at: string;
  }>(
    db,
    `SELECT id, step, tool, note, created_at FROM agent_working_memory
     WHERE turn_id = ? AND user_id = ?
     ORDER BY id ASC`,
    [params.turnId, params.userId],
  ).map((row) => ({
    id: Number(row.id),
    step: Number(row.step),
    tool: String(row.tool || ""),
    note: String(row.note || ""),
    createdAt: String(row.created_at || ""),
  }));
}

/** 旧轮次的工作记忆不留着占库 */
export function dropOldWorkingNotesSync(
  db: Database,
  params: { agentId: number; userId: number; keepTurnId: string },
) {
  db.run(
    `DELETE FROM agent_working_memory
     WHERE agent_id = ? AND user_id = ? AND turn_id != ?`,
    [params.agentId, params.userId, params.keepTurnId],
  );
}

/** 一轮结束时跑一次的归并维护。可调用函数，不依赖定时器 */
export function runIdleMaintenanceSync(
  db: Database,
  params: {
    agentId: number;
    userId: number;
    keepTurnId?: string;
    now?: Date;
  },
): { merged: number; decayed: number } {
  const merged = mergeDuplicatesSync(db, params);
  const decayed = decayUnusedSync(db, params);
  if (params.keepTurnId) {
    dropOldWorkingNotesSync(db, {
      agentId: params.agentId,
      userId: params.userId,
      keepTurnId: params.keepTurnId,
    });
  }
  return { merged, decayed };
}

export type EmbedPort = (texts: string[]) => Promise<number[][]>;

/**
 * 向量化失败就返回 null，让打分退回关键词那一路。
 * 生产默认用 llm.ts 的 embedTexts（它本身在没有云端配置时会落到本地字面向量）。
 */
export async function embedOrNull(
  texts: string[],
  port: EmbedPort = embedTexts,
): Promise<number[][] | null> {
  if (!texts.length) return null;
  try {
    const out = await port(texts);
    if (!out || out.length !== texts.length) return null;
    if (out.some((vec) => !vec?.length)) return null;
    return out;
  } catch {
    return null;
  }
}

/** 生产读路径：拿库、算查询向量、检索。写入由调用方统一落盘 */
export async function searchUserMemory(params: {
  agentId: number;
  userId: number;
  query: string;
  limit?: number;
  embed?: EmbedPort;
  now?: Date;
}): Promise<ScoredMemory[]> {
  if (params.userId <= 0) return [];
  const db = await getDb();
  const vectors = await embedOrNull([params.query], params.embed);
  return searchMemorySync(db, {
    agentId: params.agentId,
    userId: params.userId,
    query: params.query,
    queryVector: vectors?.[0] ?? null,
    limit: params.limit,
    now: params.now,
  });
}
