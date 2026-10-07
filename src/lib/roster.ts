import { contentMentionsBot, isBotGroupName } from "@/lib/bot-chat";
import { mentionSamplesForQq } from "@/lib/group-recall";
import { agentPersonaSampleSize, GROUP_NAME } from "@/lib/constants";
import { isAgentCorpusText } from "@/lib/chat-parser";
import { getDb, rowFrom, rowsFrom, withDb } from "@/lib/db";
import {
  chatCompletion,
  chatCompletionJson,
  isLlmConfigured,
} from "@/lib/llm";

export type SpeakerStat = {
  qq: string;
  displayName: string;
  textCount: number;
};

/** 统计某 QQ 在活跃归档中的条数。只计数，不把正文读进内存 */
export async function countTextsForQq(qq: string): Promise<number> {
  const db = await getDb();
  const row = rowFrom<{ c: number }>(
    db,
    `SELECT COUNT(*) AS c FROM chat_messages m
     JOIN import_batches b ON b.id = m.batch_id
     WHERE b.status = 'active' AND m.qq_number = ?`,
    [qq],
  );
  return Number(row?.c ?? 0);
}

/** 已绑定 Agent 的 QQ 集合（实时同步时用于刷新计数） */
export async function listTrackedAgentQqs(): Promise<string[]> {
  const db = await getDb();
  return rowsFrom<{ qq: string }>(
    db,
    `SELECT qq FROM agent_personas WHERE enabled = 1`,
  ).map((r) => r.qq);
}

/** 实时入库后刷新该 QQ 对应 Agent 的语料条数 */
export async function bumpAgentSourceCount(qq: string) {
  if (!qq) return;
  const count = await countTextsForQq(qq);
  await withDb((db) => {
    db.run(
      `UPDATE agent_personas
       SET source_msg_count = ?, updated_at = datetime('now')
       WHERE qq = ? AND enabled = 1`,
      [count, qq],
    );
  });
}

/** 拉取某 QQ 的群聊记录（归档导入） */
export async function listAgentGroupChat(qq: string, limit = 40) {
  const db = await getDb();
  return rowsFrom<{
    id: number;
    sender: string;
    content: string;
    sent_at: string | null;
  }>(
    db,
    `SELECT m.id, m.sender, m.content, m.sent_at
     FROM chat_messages m
     JOIN import_batches b ON b.id = m.batch_id
     WHERE b.status = 'active' AND m.qq_number = ?
     ORDER BY m.id DESC LIMIT ?`,
    [qq, Math.max(limit, limit * 8)],
  )
    .filter((row) => !isBotGroupName(row.sender) && !contentMentionsBot(row.content))
    .slice(0, limit);
}

/** 网站用户在群归档里用过的发送者名。QQ 对得上就是同一个人，不另算一个群友。 */
export async function listUserSenderNames(
  qq: string | null,
  displayName: string,
): Promise<string[]> {
  const db = await getDb();
  const name = displayName.trim();
  const rows = qq
    ? rowsFrom<{ sender: string }>(
        db,
        `SELECT DISTINCT m.sender AS sender
         FROM chat_messages m
         JOIN import_batches b ON b.id = m.batch_id
         WHERE b.status = 'active' AND (m.qq_number = ? OR m.sender = ? COLLATE NOCASE)
         LIMIT 12`,
        [qq, name],
      )
    : rowsFrom<{ sender: string }>(
        db,
        `SELECT DISTINCT m.sender AS sender
         FROM chat_messages m
         JOIN import_batches b ON b.id = m.batch_id
         WHERE b.status = 'active' AND m.sender = ? COLLATE NOCASE
         LIMIT 12`,
        [name],
      );
  return rows.map((row) => row.sender).filter(Boolean);
}

async function buildBasePersona(
  qq: string,
  displayName: string,
  textCount: number,
) {
  const db = await getDb();
  const sampleSize = agentPersonaSampleSize();
  // 只取开头一小段和最近一小段，避免把这个人的全部发言读进内存
  const recent = rowsFrom<{ content: string }>(
    db,
    `SELECT m.content AS content FROM chat_messages m
     JOIN import_batches b ON b.id = m.batch_id
     WHERE b.status = 'active' AND m.qq_number = ?
     ORDER BY m.id DESC
     LIMIT ?`,
    [qq, Math.max(sampleSize, 80)],
  )
    .map((r) => r.content)
    .filter(isAgentCorpusText)
    .reverse();
  const older = rowsFrom<{ content: string }>(
    db,
    `SELECT m.content AS content FROM chat_messages m
     JOIN import_batches b ON b.id = m.batch_id
     WHERE b.status = 'active' AND m.qq_number = ?
     ORDER BY m.id ASC
     LIMIT ?`,
    [qq, 40],
  )
    .map((r) => r.content)
    .filter(isAgentCorpusText);
  const corpus = [...older, ...recent.filter((line) => !older.includes(line))];
  const samples = pickPersonaSamples(corpus, sampleSize);

  const quotes = samples
    .filter((m) => m.length >= 4 && m.length <= 80)
    .slice(-5);

  const heard =
    samples.length >= 5
      ? await mentionSamplesForQq(qq, displayName).catch(() => [])
      : [];

  if (isLlmConfigured() && samples.length >= 5) {
    try {
      const parsed = await chatCompletionJson<{
        style_tags?: string[];
        summary?: string;
        system_prompt?: string;
        sample_quotes?: string[];
      }>(
        [
          {
            role: "system",
            content: `你是角色设定助手。根据「${GROUP_NAME}」里这个人自己的发言，以及群里别人怎么提到他，写一份能让模型模仿他说话的设定。只输出 JSON：style_tags, summary, system_prompt, sample_quotes。system_prompt 用中文，规定句长、语气词、口头禅、爱聊的话题和避讳。他是泡在这个群里的人：说话用他自己的口气，但要像真的听过群里这些人和梗。不要写成温柔客服或人物小传，不要要求他只会复读自己的原句，也不要引用网站名片。sample_quotes 必须是他本人样本里的原句，不要改写。禁止人身攻击，不要编造样本里没有的隐私。`,
          },
          {
            role: "user",
            content: `昵称：${displayName}\nQQ：${qq}\n文本条数约：${textCount}\n他本人的样本从早到晚，后半段更近：\n${samples
              .slice(0, 80)
              .map((s, i) => `${i + 1}. ${s}`)
              .join("\n")}${
              heard.length
                ? `\n群里别人提到他的话（只用来知道他在群里的位置，不要写成他的原句）：\n${heard
                    .map((line, i) => `${i + 1}. ${line}`)
                    .join("\n")}`
                : ""
            }`,
          },
        ],
        { temperature: 0.3, maxTokens: 1400 },
      );
      return {
        styleTags: parsed.style_tags?.slice(0, 8) || ["群友"],
        summary: parsed.summary || `${displayName} 的群聊分身`,
        systemPrompt:
          parsed.system_prompt || heuristicPrompt(displayName, quotes),
        sampleQuotes: parsed.sample_quotes?.slice(0, 5) || quotes,
        sourceMsgCount: textCount,
      };
    } catch {
      /* 回落启发式 */
    }
  }

  return {
    styleTags: ["群友"],
    summary:
      samples.length > 0
        ? `${displayName} · 已绑定 QQ，语料 ${textCount} 条`
        : `${displayName} · 已绑定 QQ，等待群聊语料`,
    systemPrompt: heuristicPrompt(displayName, quotes),
    sampleQuotes: quotes,
    sourceMsgCount: textCount,
  };
}

/** 人设样本拉开到全年：保留最近一段，其余按时间均匀抽，避免只学会最近一天 */
export function pickPersonaSamples(lines: string[], limit: number): string[] {
  if (lines.length <= limit) return lines;
  const recentCount = Math.min(36, Math.floor(limit / 3));
  const recent = lines.slice(-recentCount);
  const older = lines.slice(0, lines.length - recentCount);
  const need = limit - recent.length;
  const picked: string[] = [];
  const step = older.length / need;
  for (let i = 0; i < need; i++) {
    picked.push(older[Math.min(older.length - 1, Math.floor(i * step))]);
  }
  return [...picked, ...recent];
}

function heuristicPrompt(displayName: string, quotes: string[]) {
  return [
    `你是 QQ 群「${GROUP_NAME}」里的群友「${displayName}」的数字分身。`,
    `用中文、群聊口吻回复，可以玩笑玩梗，禁止人身攻击，不要编造未出现的隐私。`,
    quotes.length ? `参考口头禅：\n- ${quotes.join("\n- ")}` : "",
  ]
    .filter(Boolean)
    .join("\n");
}

function normalizeQq(raw: string) {
  const qq = String(raw || "").trim();
  if (!/^\d{5,12}$/.test(qq)) {
    throw new Error("QQ 号须为 5–12 位数字");
  }
  return qq;
}

/** Admin：手动创建 Agent（姓名 + 插画 + 绑 QQ） */
export async function createManualAgent(params: {
  qq: string;
  displayName: string;
  illustrationUrl?: string;
}) {
  const qq = normalizeQq(params.qq);
  const displayName = String(params.displayName || "").trim();
  if (displayName.length < 1 || displayName.length > 24) {
    throw new Error("显示名长度需为 1–24");
  }
  const illustrationUrl = String(params.illustrationUrl || "").trim();

  const db = await getDb();
  const exists = rowFrom<{ id: number; enabled: number }>(
    db,
    `SELECT id, enabled FROM agent_personas WHERE qq = ?`,
    [qq],
  );
  if (exists && exists.enabled) {
    throw new Error("该 QQ 已绑定其他 Agent");
  }

  const textCount = await countTextsForQq(qq);
  const persona = await buildBasePersona(qq, displayName, textCount);

  const id = await withDb((db2) => {
    if (exists && !exists.enabled) {
      // 复用已停用记录，避免 QQ 唯一约束占坑
      db2.run(
        `UPDATE agent_personas SET
           display_name = ?, illustration_url = ?, style_tags = ?, summary = ?,
           system_prompt = ?, sample_quotes = ?, source_msg_count = ?,
           sealed = 1, enabled = 1, built_at = datetime('now'), updated_at = datetime('now')
         WHERE id = ?`,
        [
          displayName,
          illustrationUrl,
          JSON.stringify(persona.styleTags),
          persona.summary,
          persona.systemPrompt,
          JSON.stringify(persona.sampleQuotes),
          persona.sourceMsgCount,
          exists.id,
        ],
      );
      return exists.id;
    }
    db2.run(
      `INSERT INTO agent_personas
        (qq, display_name, illustration_url, style_tags, summary, system_prompt,
         sample_quotes, source_msg_count, sealed, enabled, built_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1, 1, datetime('now'), datetime('now'))`,
      [
        qq,
        displayName,
        illustrationUrl,
        JSON.stringify(persona.styleTags),
        persona.summary,
        persona.systemPrompt,
        JSON.stringify(persona.sampleQuotes),
        persona.sourceMsgCount,
      ],
    );
    return rowFrom<{ id: number }>(
      db2,
      `SELECT id FROM agent_personas WHERE qq = ?`,
      [qq],
    )!.id;
  });

  return { id, qq, displayName, illustrationUrl, sourceMsgCount: textCount, ...(await indexAgentQq(qq)) };
}

/** Admin：更新姓名 / 插画 / 换绑 QQ */
export async function updateManualAgent(params: {
  id: number;
  displayName?: string;
  illustrationUrl?: string;
  qq?: string;
}) {
  const agent = await getAgentById(params.id);
  if (!agent) throw new Error("Agent 不存在");

  let qq = agent.qq;
  if (params.qq != null && String(params.qq).trim() !== agent.qq) {
    qq = normalizeQq(params.qq);
    const clash = rowFrom<{ id: number }>(
      await getDb(),
      `SELECT id FROM agent_personas WHERE qq = ? AND id != ?`,
      [qq, params.id],
    );
    if (clash) throw new Error("该 QQ 已绑定其他 Agent");
  }

  const displayName =
    params.displayName != null
      ? String(params.displayName).trim()
      : agent.display_name;
  if (displayName.length < 1 || displayName.length > 24) {
    throw new Error("显示名长度需为 1–24");
  }

  const illustrationUrl =
    params.illustrationUrl != null
      ? String(params.illustrationUrl).trim()
      : agent.illustration_url || "";

  const textCount = await countTextsForQq(qq);
  // 换绑 QQ 或改名时重炼人设；仅改插画则保留人设
  const needRebuild =
    qq !== agent.qq ||
    (params.displayName != null && displayName !== agent.display_name);

  if (needRebuild) {
    const persona = await buildBasePersona(qq, displayName, textCount);
    await withDb((db) => {
      db.run(
        `UPDATE agent_personas SET
           qq = ?, display_name = ?, illustration_url = ?,
           style_tags = ?, summary = ?, system_prompt = ?, sample_quotes = ?,
           source_msg_count = ?, updated_at = datetime('now')
         WHERE id = ?`,
        [
          qq,
          displayName,
          illustrationUrl,
          JSON.stringify(persona.styleTags),
          persona.summary,
          persona.systemPrompt,
          JSON.stringify(persona.sampleQuotes),
          persona.sourceMsgCount,
          params.id,
        ],
      );
    });
    await indexAgentQq(qq);
  } else {
    await withDb((db) => {
      db.run(
        `UPDATE agent_personas SET
           display_name = ?, illustration_url = ?,
           source_msg_count = ?, updated_at = datetime('now')
         WHERE id = ?`,
        [displayName, illustrationUrl, textCount, params.id],
      );
    });
  }

  return getAgentById(params.id);
}

/** 按这个 QQ 在已导入归档里的发言建向量。人设在创建时已经炼过 */
async function indexAgentQq(qq: string): Promise<{ indexed: number; indexWarning: string }> {
  try {
    const { rebuildEmbeddingsForQq } = await import("@/lib/rag");
    const result = await rebuildEmbeddingsForQq(qq);
    return { indexed: result.indexed, indexWarning: "" };
  } catch (error) {
    return {
      indexed: 0,
      indexWarning: error instanceof Error ? error.message : "向量索引失败",
    };
  }
}

/** Admin：停用（软删除，保留历史 DM） */
export async function disableAgent(id: number) {
  await withDb((db) => {
    db.run(
      `UPDATE agent_personas SET enabled = 0, updated_at = datetime('now') WHERE id = ?`,
      [id],
    );
  });
}

/** Admin：按当前群聊语料重炼人设 */
export async function rebuildAgentPersona(id: number) {
  const agent = await getAgentById(id);
  if (!agent) throw new Error("Agent 不存在");
  const textCount = await countTextsForQq(agent.qq);
  const persona = await buildBasePersona(
    agent.qq,
    agent.display_name,
    textCount,
  );
  await withDb((db) => {
    db.run(
      `UPDATE agent_personas SET
         style_tags = ?, summary = ?, system_prompt = ?, sample_quotes = ?,
         source_msg_count = ?, built_at = datetime('now'), updated_at = datetime('now')
       WHERE id = ?`,
      [
        JSON.stringify(persona.styleTags),
        persona.summary,
        persona.systemPrompt,
        JSON.stringify(persona.sampleQuotes),
        persona.sourceMsgCount,
        id,
      ],
    );
  });
  return { ok: true as const, sourceMsgCount: textCount };
}

export async function listRosterAgents() {
  const db = await getDb();
  return rowsFrom<{
    id: number;
    qq: string;
    display_name: string;
    illustration_url: string;
    summary: string;
    style_tags: string;
    sample_quotes: string;
    source_msg_count: number;
    sealed: number;
    updated_at: string;
  }>(
    db,
    `SELECT id, qq, display_name, COALESCE(illustration_url,'') as illustration_url,
            summary, style_tags, sample_quotes,
            source_msg_count, sealed, updated_at
     FROM agent_personas WHERE enabled = 1
     ORDER BY id ASC`,
  );
}

export async function getAgentById(id: number) {
  const db = await getDb();
  return rowFrom<{
    id: number;
    qq: string;
    display_name: string;
    illustration_url: string;
    summary: string;
    system_prompt: string;
    source_msg_count: number;
  }>(
    db,
    `SELECT id, qq, display_name, COALESCE(illustration_url,'') as illustration_url,
            summary, system_prompt, source_msg_count
     FROM agent_personas
     WHERE id = ? AND enabled = 1`,
    [id],
  );
}

export async function getDrift(userId: number, agentId: number) {
  const db = await getDb();
  return rowFrom<{ drift_notes: string }>(
    db,
    `SELECT drift_notes FROM agent_user_drifts WHERE user_id = ? AND agent_id = ?`,
    [userId, agentId],
  );
}

export async function setDrift(
  userId: number,
  agentId: number,
  notes: string,
) {
  await withDb((db) => {
    db.run(
      `INSERT INTO agent_user_drifts (user_id, agent_id, drift_notes, updated_at)
       VALUES (?, ?, ?, datetime('now'))
       ON CONFLICT(user_id, agent_id) DO UPDATE SET
         drift_notes = excluded.drift_notes,
         updated_at = datetime('now')`,
      [userId, agentId, notes],
    );
  });
}

export async function maybeUpdateDrift(params: {
  userId: number;
  agentId: number;
  displayName: string;
  sessionLines: { role: string; content: string }[];
  force?: boolean;
  turnCount: number;
  everyN: number;
}) {
  if (!params.force && params.turnCount % params.everyN !== 0) return;
  if (!isLlmConfigured() || params.sessionLines.length < 2) return;

  const prev =
    (await getDrift(params.userId, params.agentId))?.drift_notes || "";
  try {
    const notes = await chatCompletion(
      [
        {
          role: "system",
          content: `根据用户与「${GROUP_NAME}」群友「${params.displayName}」分身的私聊，更新对该用户私有的印象笔记（Drift）。只输出简洁中文要点，不超过 400 字。不要写入隐私证件号。`,
        },
        {
          role: "user",
          content: `已有 Drift：\n${prev || "（无）"}\n\n本会话摘录：\n${params.sessionLines
            .slice(-16)
            .map((l) => `${l.role}: ${l.content}`)
            .join("\n")}`,
        },
      ],
      { temperature: 0.3, maxTokens: 500 },
    );
    await setDrift(params.userId, params.agentId, notes);
  } catch {
    /* 忽略漂移失败 */
  }
}
