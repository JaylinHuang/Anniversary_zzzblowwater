import { agentPersonaSampleSize, GROUP_NAME } from "@/lib/constants";
import { isCountableTextMessage } from "@/lib/chat-parser";
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

/** 统计某 QQ 在活跃归档中的可计票文本条数 */
export async function countTextsForQq(qq: string): Promise<number> {
  const db = await getDb();
  const rows = rowsFrom<{ content: string }>(
    db,
    `SELECT m.content FROM chat_messages m
     JOIN import_batches b ON b.id = m.batch_id
     WHERE b.status = 'active' AND m.qq_number = ?`,
    [qq],
  );
  return rows.filter((r) => isCountableTextMessage(r.content)).length;
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

/** 拉取某 QQ 的群聊记录（归档，含 OneBot 实时） */
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
    [qq, limit],
  );
}

async function buildBasePersona(
  qq: string,
  displayName: string,
  textCount: number,
) {
  const db = await getDb();
  const sampleSize = agentPersonaSampleSize();
  const samples = rowsFrom<{ content: string }>(
    db,
    `SELECT content FROM chat_messages m
     JOIN import_batches b ON b.id = m.batch_id
     WHERE b.status = 'active' AND m.qq_number = ?
     ORDER BY m.sent_at DESC LIMIT ?`,
    [qq, sampleSize * 2],
  )
    .map((r) => r.content)
    .filter(isCountableTextMessage)
    .slice(0, sampleSize);

  const quotes = samples
    .filter((m) => m.length >= 4 && m.length <= 80)
    .slice(0, 5);

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
            content: `你是角色设定助手。根据「${GROUP_NAME}」群聊发言样本，提炼一位群友的说话风格。只输出 JSON：style_tags, summary, system_prompt, sample_quotes。system_prompt 须为中文，要求扮演该群友、可玩梗、禁止人身攻击与编造隐私。`,
          },
          {
            role: "user",
            content: `昵称：${displayName}\nQQ：${qq}\n文本条数约：${textCount}\n样本：\n${samples
              .slice(0, 40)
              .map((s, i) => `${i + 1}. ${s}`)
              .join("\n")}`,
          },
        ],
        { temperature: 0.4, maxTokens: 900 },
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

  return { id, qq, displayName, illustrationUrl, sourceMsgCount: textCount };
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
