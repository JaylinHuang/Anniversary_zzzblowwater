/**
 * 本站私聊的一轮：把提示词、工具实现、记忆策略装到回路上。
 * 回路本身在 agent-loop.ts，工具注册在 agent-tools.ts，记忆策略在 memory-score.ts / agent-memory.ts。
 */
import { randomBytes } from "crypto";
import type { Database } from "sql.js";
import { GROUP_NAME } from "@/lib/constants";
import { flushDb, getDb } from "@/lib/db";
import {
  AGENT_HARD_RULES,
  correctOtherReply,
  correctSelfReply,
  formatSpeakerIdentity,
  replyTemperature,
  sameQq,
} from "@/lib/agent-crew";
import {
  MAX_TURN_STEPS,
  runToolLoop,
  type LoopCallRecord,
  type StepFn,
} from "@/lib/agent-loop";
import {
  assertSafeRegistry,
  buildToolRegistry,
  type ToolPorts,
} from "@/lib/agent-tools";
import {
  embedOrNull,
  findSessionSummarySync,
  getCompressedUptoSync,
  listWorkingNotesSync,
  noteWorkingSync,
  normalizeSessionSummary,
  setCompressedUptoSync,
  upsertSessionSummarySync,
  rememberSync,
  runIdleMaintenanceSync,
  searchMemorySync,
  type EmbedPort,
  type WorkingNote,
} from "@/lib/agent-memory";
import {
  IMPORTANCE_EXPLICIT,
  IMPORTANCE_PROFILE,
  acceptSummary,
  compact,
  detectExplicitRemember,
  extractTurnMemory,
  foldedText,
  memoryKeywords,
  memoryTopic,
  planWindowCompression,
  type DraftMemory,
  type ScoredMemory,
  type WindowMessage,
} from "@/lib/memory-score";
import { isAgentCorpusText } from "@/lib/chat-parser";
import { chatCompletion, chatCompletionWithTools, isLlmConfigured } from "@/lib/llm";
import { collectGroupRecall, formatGroupRecallBlock } from "@/lib/group-recall";
import { applyPersonaPatch, topicNeedles } from "@/lib/fact-timeline";
import { openRecall, sameNeedles, sealRecall } from "@/lib/recall-cache";
import { retrieveRagForQq } from "@/lib/rag";
import { listAgentGroupChat } from "@/lib/roster";
import { formatSpeakStyle, loadSpeakStyle } from "@/lib/speak-stats";

/** 短期记忆就是这个窗口。超过这么多条就把旧的压成长期摘要 */
export const DM_WINDOW_MESSAGES = 12;

export type SummarizePort = (foldText: string) => Promise<string>;
export type GroupLinesPort = (query: string, limit: number) => Promise<string[]>;

export function formatMemoryBlock(hits: ScoredMemory[]): string {
  if (!hits.length) {
    return "长期记忆（只属于当前这位用户）：还没有。需要确认时用 search_memory 再查一次。";
  }
  return [
    "长期记忆（只属于当前这位用户，别人的私聊记忆读不到）：",
    ...hits.map((hit, i) => `${i + 1}. ${hit.fact}（主题：${hit.topic}）`),
  ].join("\n");
}

export function formatWorkingBlock(notes: WorkingNote[]): string {
  if (!notes.length) return "";
  return [
    "本轮工作记忆（只属于这一轮和这位用户）：",
    ...notes.map(
      (note) => `第 ${note.step} 步${note.tool ? `·${note.tool}` : ""}：${note.note}`,
    ),
  ].join("\n");
}

const TOOL_GUIDE = [
  "你有四件工具，别的一概没有：",
  "- search_memory：查你和当前这位用户之间的长期记忆。记不清就先查，不要凭空补。",
  "- remember：对面说「记住」「请记住」「别忘了」时，把那条事实写下来。同一件事改口了，用它覆盖，不要让两种说法同时存在；不同的事（比如对花生过敏和不吃香菜）各记各的，不要互相覆盖。",
  "- search_group_lines：在整个群聊里找某个人或某件事，问你自己时也要查。结果会写明时间和是谁说的。和人设或更早的发言矛盾时，以时间更晚的那条为准，不要整段贴进回复。",
  "- working_note：记这一轮的中间结论，只在这一轮有效。",
  "工具结果会回到这一轮，你可以接着再要一步。",
  "最后一条不带工具调用的回复才是发给用户的话：那一条里不要出现工具名、调用过程或括号里的旁白。",
].join("\n");

const MEMORY_GUIDE = [
  "记忆分三层：这一轮的对话就在眼前；长期事实要查才看得到；本轮的中间状态写进工作记忆。",
  "长期记忆按网站用户分开。别人跟你说过的私聊内容，不属于当前这位用户，不要拿来回答他。",
].join("\n");

/** 一轮的系统提示。身份提示和硬性事实边界照旧，只是后面接上工具和记忆的规矩 */
export function buildTurnSystemPrompt(params: {
  agentName: string;
  systemPrompt: string;
  userName: string;
  userAliases: string[];
  self: boolean;
  memoryBlock: string;
  workingBlock?: string;
  speakStyleText?: string;
  summaryNote?: string;
  groupNote?: string;
}): string {
  return [
    formatSpeakerIdentity(params.userName, params.userAliases, {
      self: params.self,
      agentName: params.agentName,
    }),
    params.systemPrompt,
    params.speakStyleText || "",
    `你是「${GROUP_NAME}」里的「${params.agentName}」。人设只有一份，但每一轮对面是谁要单独看：只有 QQ 和你相同的那位才是你自己，其他人是另一个群友。`,
    AGENT_HARD_RULES,
    "用这个人平时的口气说话：句长、语气词、口头禅照人设来。先想对方在问什么，再回答。不要写成客服、旁白或人物介绍，不要输出「[回复消息]」这类导出标记。",
    MEMORY_GUIDE,
    TOOL_GUIDE,
    params.memoryBlock,
    params.workingBlock || "",
    params.summaryNote || "",
    params.groupNote || "",
    "这一轮怎么回：先接住对方刚说的那一句。问你自己或问某个群友时，用上面群聊发言里的说法和时间来回答，再用你的口气说出来。发言互相矛盾或和人设矛盾时，以时间更晚的那条为准。发言里没有的战绩和水平就说不记得。不要把别人的话当成你的经历，也不要整段粘贴。",
  ]
    .filter(Boolean)
    .join("\n\n");
}

/**
 * 这一轮该写什么长期记忆。
 * 显式「记住／请记住／别忘了」最高优先，立刻落库；
 * 否则一轮结束最多抽一条结构化记忆；没有事实就返回 null，一条都不写。
 * 只看用户原话，分身自己的闲聊回复不落库。
 */
export function planTurnMemory(params: {
  userText: string;
  userName?: string;
}): (DraftMemory & { explicit: boolean }) | null {
  const found = detectExplicitRemember(params.userText);
  if (found.explicit && found.fact) {
    const who = (params.userName || "").trim();
    return {
      fact: (who ? `${who}：${found.fact}` : found.fact).slice(0, 180),
      topic: memoryTopic(found.fact),
      importance: IMPORTANCE_EXPLICIT,
      kind: "fact",
      explicit: true,
    };
  }
  const draft = extractTurnMemory(params);
  return draft ? { ...draft, explicit: false } : null;
}

/** 生产用的群聊检索：问自己或问别人，都先在整段群聊里对话题 */
export async function defaultGroupLines(
  qq: string,
  query: string,
  limit: number,
  ctx?: { selfName?: string; persona?: string },
): Promise<string[]> {
  try {
    const recalled = await collectGroupRecall({
      selfQq: qq,
      selfName: ctx?.selfName,
      talk: query,
      persona: ctx?.persona,
      limit,
    });
    if (recalled.lines.length) return recalled.lines.slice(0, limit);
  } catch {
    /* 全群检索失败时退回本人发言 */
  }
  const out: string[] = [];
  try {
    for (const hit of await retrieveRagForQq(qq, query, limit)) {
      if (hit.content && !out.includes(hit.content)) out.push(`你自己说过：${hit.content}`);
    }
  } catch {
    /* 向量不可用时只走关键词 */
  }
  if (out.length < limit) {
    const keys = memoryKeywords(query);
    for (const row of await listAgentGroupChat(qq, 80)) {
      if (out.length >= limit) break;
      if (!isAgentCorpusText(row.content)) continue;
      if (!keys.some((key) => row.content.includes(key))) continue;
      const line = `你自己说过：${row.content}`;
      if (!out.includes(line)) out.push(line);
    }
  }
  return out.slice(0, limit);
}

/** 生产用的摘要：压缩时必须把关键数字和关键约束原样带过去 */
export async function defaultSummarize(foldText: string): Promise<string> {
  return chatCompletion(
    [
      {
        role: "system",
        content: [
          "把下面这段私聊压成一段不超过 300 字的摘要，用于长期记忆。",
          "如果内容里带有「已有摘要」，就把它和「新增对话」合并成一段新的完整摘要，不要分开写。",
          "关键数字（房间号、时间、数量）和对方要求保密的约定必须原样写进摘要，一个字都不能漏，包括已有摘要里的。",
          "只输出摘要正文，不要解释。",
        ].join("\n"),
      },
      { role: "user", content: foldText },
    ],
    { temperature: 0.2, maxTokens: 600 },
  );
}

/** 把四个工具接到这一轮的数据库作用域上。写入先留在内存库，由调用方统一落盘 */
export function buildTurnPorts(params: {
  db: Database;
  agentId: number;
  agentQq: string;
  agentName?: string;
  persona?: string;
  userId: number;
  turnId: string;
  identified: boolean;
  embed?: EmbedPort;
  groupLines?: GroupLinesPort;
  now?: Date;
}): ToolPorts {
  const now = params.now ?? new Date();
  return {
    async searchMemory(query, limit) {
      if (!params.identified) return [];
      const vectors = await embedOrNull([query], params.embed);
      return searchMemorySync(params.db, {
        agentId: params.agentId,
        userId: params.userId,
        query,
        queryVector: vectors?.[0] ?? null,
        limit,
        now,
      }).map((hit) => ({ fact: hit.fact, topic: hit.topic, score: hit.score }));
    },
    async remember(input) {
      if (!params.identified) {
        return { saved: false, replaced: 0, reason: "对面身份没确认" };
      }
      const vectors = await embedOrNull([input.fact], params.embed);
      const out = rememberSync(params.db, {
        agentId: params.agentId,
        userId: params.userId,
        fact: input.fact,
        topic: input.topic,
        importance: input.importance,
        vector: vectors?.[0] ?? null,
        now,
      });
      return {
        saved: out.saved,
        replaced: out.replaced.length,
        reason: out.reason,
      };
    },
    async searchGroupLines(query, limit) {
      const port =
        params.groupLines ||
        ((q: string, n: number) =>
          defaultGroupLines(params.agentQq, q, n, {
            selfName: params.agentName,
            persona: params.persona,
          }));
      try {
        return await port(query, limit);
      } catch {
        return [];
      }
    },
    async workingNote(note, step) {
      noteWorkingSync(params.db, {
        turnId: params.turnId,
        agentId: params.agentId,
        userId: params.userId,
        step,
        tool: "working_note",
        note,
        now,
      });
    },
  };
}

/** 带库内消息 id 的窗口消息。id 用来记「已经压到哪条」 */
export type DmWindowMessage = WindowMessage & { id?: number };

/**
 * 短期窗口压缩。摘要丢了关键数字或关键约束就拒绝压缩，旧对话留在窗口里。
 *
 * 带 sessionId 且每条消息都有 id 时走水位路径：
 * - 已经折进摘要的消息（id 不超过水位）直接离开窗口，不再交给摘要；
 * - 只摘要水位之后新折出去的那一段，连同本会话已有的那条摘要一起重写；
 * - 会话摘要就地更新，同一会话里有效的摘要始终只有一条；
 * - 摘要被拒绝时水位不动，没折进去的消息继续留在窗口里。
 * 不带这些信息时保持原来的无状态行为。
 */
export async function compressDmWindow(params: {
  db: Database;
  agentId: number;
  userId: number;
  messages: DmWindowMessage[];
  maxMessages?: number;
  sessionId?: number;
  summarize?: SummarizePort;
  embed?: EmbedPort;
  now?: Date;
}): Promise<{
  window: DmWindowMessage[];
  summary: string | null;
  /** 当前会话里有效的那条摘要（含之前轮次写的），没有就是 null */
  sessionSummary?: string | null;
  refused: boolean;
  missing: string[];
}> {
  const max = params.maxMessages ?? DM_WINDOW_MESSAGES;
  const sessionId = params.sessionId ?? 0;
  const scoped =
    sessionId > 0 &&
    params.userId > 0 &&
    params.messages.every((msg) => typeof msg.id === "number");
  if (scoped) {
    return compressScoped({ ...params, sessionId, maxMessages: max });
  }

  const plan = planWindowCompression(params.messages, max);
  if (!plan.fold.length) {
    return { window: plan.keep, summary: null, refused: false, missing: [] };
  }
  const source = foldedText(plan.fold);
  if (!params.summarize || params.userId <= 0) {
    return { window: params.messages, summary: null, refused: true, missing: [] };
  }
  let summary = "";
  try {
    summary = (await params.summarize(source)).trim();
  } catch {
    return { window: params.messages, summary: null, refused: true, missing: [] };
  }
  const verdict = acceptSummary(source, summary);
  if (!verdict.ok) {
    return {
      window: params.messages,
      summary: null,
      refused: true,
      missing: verdict.missing,
    };
  }
  const vectors = await embedOrNull([summary], params.embed);
  rememberSync(params.db, {
    agentId: params.agentId,
    userId: params.userId,
    fact: summary,
    topic: `摘要:${compact(summary).slice(0, 20)}`,
    kind: "summary",
    importance: IMPORTANCE_PROFILE,
    vector: vectors?.[0] ?? null,
    now: params.now,
  });
  return { window: plan.keep, summary, refused: false, missing: [] };
}

/** 水位路径：只处理水位之后的消息，会话摘要就地更新 */
async function compressScoped(params: {
  db: Database;
  agentId: number;
  userId: number;
  messages: DmWindowMessage[];
  maxMessages: number;
  sessionId: number;
  summarize?: SummarizePort;
  embed?: EmbedPort;
  now?: Date;
}): Promise<{
  window: DmWindowMessage[];
  summary: string | null;
  sessionSummary: string | null;
  refused: boolean;
  missing: string[];
}> {
  const scope = {
    agentId: params.agentId,
    userId: params.userId,
    sessionId: params.sessionId,
  };
  const upto = getCompressedUptoSync(params.db, scope);
  // 水位以内的消息已经折进摘要，真正离开窗口
  const pending = params.messages.filter((msg) => Number(msg.id) > upto);
  const previous = findSessionSummarySync(params.db, scope)?.fact ?? null;
  const plan = planWindowCompression(pending, params.maxMessages);
  if (!plan.fold.length) {
    return {
      window: plan.keep,
      summary: null,
      sessionSummary: previous,
      refused: false,
      missing: [],
    };
  }
  const refuse = (missing: string[]) => ({
    window: pending,
    summary: null,
    sessionSummary: previous,
    refused: true,
    missing,
  });
  if (!params.summarize) return refuse([]);

  // 只摘要新折出去的那一段；已有摘要作为底稿一起带上，它的数字和约束也不能丢
  const fresh = foldedText(plan.fold);
  const mustKeep = previous ? `${previous}\n${fresh}` : fresh;
  const input = previous ? `已有摘要：${previous}\n新增对话：\n${fresh}` : fresh;
  let summary = "";
  try {
    summary = normalizeSessionSummary(await params.summarize(input));
  } catch {
    return refuse([]);
  }
  // 按实际落库的样子验：截断后丢了数字同样算丢
  const verdict = acceptSummary(mustKeep, summary);
  if (!verdict.ok) return refuse(verdict.missing);

  const vectors = await embedOrNull([summary], params.embed);
  const saved = upsertSessionSummarySync(params.db, {
    ...scope,
    fact: summary,
    importance: IMPORTANCE_PROFILE,
    vector: vectors?.[0] ?? null,
    now: params.now,
  });
  if (!saved.saved) return refuse([]);
  setCompressedUptoSync(params.db, {
    ...scope,
    uptoId: Number(plan.fold[plan.fold.length - 1].id),
    now: params.now,
  });
  return {
    window: plan.keep,
    summary,
    sessionSummary: summary,
    refused: false,
    missing: [],
  };
}

export type TurnDeps = {
  /** 注入内存库。给了它就不打开磁盘上的库、不落盘、不读说话风格（测试用，生产不传） */
  db?: Database;
  step?: StepFn;
  embed?: EmbedPort;
  summarize?: SummarizePort;
  groupLines?: GroupLinesPort;
  maxSteps?: number;
  windowSize?: number;
  now?: Date;
};

export type TurnResult = {
  reply: string;
  turnId: string;
  steps: number;
  calls: LoopCallRecord[];
  hitCap: boolean;
  /** 这一轮写了几条长期记忆 */
  written: number;
  /** 给浏览器存着的检索回执。同一话题下次带上，服务器就不再扫归档 */
  recallToken?: string;
};

/**
 * 跑完一轮私聊。
 * 显式「记住」在回复发出前就落库；一轮结束最多再抽一条结构化记忆；
 * 没有事实就一条都不写。
 */
export async function runMemberTurnDetailed(params: {
  agent: {
    id: number;
    qq: string;
    display_name: string;
    system_prompt: string;
  };
  userId: number;
  userName: string;
  userQq: string | null;
  userAliases: string[];
  userText: string;
  history: { id?: number; role: string; content: string }[];
  /** 当前私聊会话 id。带上它，窗口压缩才会记水位、会话摘要才会就地更新 */
  sessionId?: number;
  /** 浏览器带回的检索回执。验签失败就当没有 */
  recallToken?: string;
  deps?: TurnDeps;
}): Promise<TurnResult> {
  const deps = params.deps || {};
  const now = deps.now ?? new Date();
  const turnId = randomBytes(8).toString("hex");
  const db = deps.db ?? (await getDb());
  // 注入了内存库就不碰磁盘，落盘变成空操作
  const flush = deps.db ? async () => {} : flushDb;
  const agentId = params.agent.id;
  const userId = params.userId;
  // 对面是哪位网站用户必须确定，否则这一轮不碰私聊记忆
  const identified = userId > 0;
  const self = sameQq(params.userQq, params.agent.qq);
  let written = 0;

  // 1. 显式「记住」立刻落库并覆盖同主题旧记忆，不等这一轮结束
  const plan = planTurnMemory({
    userText: params.userText,
    userName: params.userName,
  });
  if (plan?.explicit && identified) {
    const vectors = await embedOrNull([plan.fact], deps.embed);
    const out = rememberSync(db, {
      agentId,
      userId,
      fact: plan.fact,
      topic: plan.topic,
      importance: plan.importance,
      kind: plan.kind,
      vector: vectors?.[0] ?? null,
      now,
    });
    if (out.saved) written++;
    await flush();
  }

  // 2. 短期窗口：超长就压成一条长期摘要，压不安全就留着
  const incoming: DmWindowMessage[] = params.history
    .slice(-40)
    .map((line) => ({
      id: line.id,
      role: (line.role === "user" ? "user" : "assistant") as "user" | "assistant",
      content: line.content,
    }))
    .filter((line) => {
      if (line.role === "user") return true;
      if (self) return !/群里那个/.test(line.content);
      return true;
    });
  const summarize =
    deps.summarize || (isLlmConfigured() ? defaultSummarize : undefined);
  const folded = await compressDmWindow({
    db,
    agentId,
    userId,
    messages: incoming,
    maxMessages: deps.windowSize ?? DM_WINDOW_MESSAGES,
    sessionId: params.sessionId,
    summarize,
    embed: deps.embed,
    now,
  });
  if (folded.summary) written++;

  // 3. 开轮先检索一次长期记忆，当作常驻的短块
  const queryVectors = identified
    ? await embedOrNull([params.userText], deps.embed)
    : null;
  const hits = identified
    ? searchMemorySync(db, {
        agentId,
        userId,
        query: params.userText,
        queryVector: queryVectors?.[0] ?? null,
        limit: 5,
        now,
      })
    : [];

  const speakStyle = deps.db
    ? null
    : await loadSpeakStyle(params.agent.qq).catch(() => null);
  const talk = [
    ...params.history
      .filter((line) => line.role === "user")
      .slice(-4)
      .map((line) => line.content),
    params.userText,
  ].join("\n");
  let systemPrompt = params.agent.system_prompt;
  let groupNote = "";
  let recallToken: string | undefined;
  let personaSql: string | null = null;
  if (!deps.db) {
    const needles = topicNeedles(params.userText, [params.agent.display_name]);
    const cached = params.recallToken
      ? openRecall(params.recallToken, params.agent.id)
      : null;
    if (cached && sameNeedles(cached.needles, needles)) {
      groupNote = formatGroupRecallBlock(cached.names, cached.lines);
      recallToken = params.recallToken;
    } else {
      const found = await collectGroupRecall({
        selfQq: params.agent.qq,
        selfName: params.agent.display_name,
        talk,
        focus: params.userText,
        persona: systemPrompt,
        limit: 8,
      }).catch(() => ({
        names: [] as string[],
        lines: [] as string[],
        personaPatch: null as string | null,
      }));
      if (found.personaPatch) {
        const next = applyPersonaPatch(systemPrompt, found.personaPatch);
        if (next !== systemPrompt) {
          systemPrompt = next;
          personaSql = next;
        }
      }
      groupNote = formatGroupRecallBlock(found.names, found.lines);
      if (needles.length) {
        recallToken = sealRecall({
          agentId: params.agent.id,
          needles,
          names: found.names,
          lines: found.lines,
        });
      }
    }
  }
  const system = buildTurnSystemPrompt({
    agentName: params.agent.display_name,
    systemPrompt,
    userName: params.userName,
    userAliases: params.userAliases,
    self,
    memoryBlock: formatMemoryBlock(hits),
    workingBlock: formatWorkingBlock(
      listWorkingNotesSync(db, { turnId, userId }),
    ),
    speakStyleText: speakStyle ? formatSpeakStyle(speakStyle) : "",
    summaryNote: [
      folded.sessionSummary
        ? `这场私聊更早的内容已压成摘要（原样保留了关键数字和约束）：${folded.sessionSummary}`
        : "",
      folded.refused
        ? "这一轮没有压缩旧对话：摘要会丢掉关键数字或关键约束，旧对话继续留在上面。"
        : "",
    ]
      .filter(Boolean)
      .join("\n"),
    groupNote,
  });

  // 4. 多步工具回路
  const tools = assertSafeRegistry(buildToolRegistry());
  const ports = buildTurnPorts({
    db,
    agentId,
    agentQq: params.agent.qq,
    agentName: params.agent.display_name,
    persona: systemPrompt,
    userId,
    turnId,
    identified,
    embed: deps.embed,
    groupLines: deps.groupLines,
    now,
  });
  const temperature = replyTemperature(params.userText);
  const stepFn: StepFn =
    deps.step ||
    ((messages, specs) =>
      chatCompletionWithTools(messages, {
        temperature,
        maxTokens: 500,
        tools: specs,
      }));

  let reply: string;
  let steps = 0;
  let calls: LoopCallRecord[] = [];
  let hitCap = false;
  if (!deps.step && !isLlmConfigured()) {
    reply = `（未配置大模型）${params.agent.display_name}对${params.userName}说：收到「${params.userText.slice(0, 40)}」。`;
  } else {
    const outcome = await runToolLoop({
      messages: [
        { role: "system", content: system },
        ...folded.window.map((line) => ({
          role: line.role,
          content: line.content,
        })),
        { role: "user", content: params.userText },
      ],
      tools,
      ports,
      identified,
      step: stepFn,
      maxSteps: deps.maxSteps ?? MAX_TURN_STEPS,
      // 第二步起把这一轮已经写进库的工作记忆读出来给模型看
      workingContext() {
        return formatWorkingBlock(listWorkingNotesSync(db, { turnId, userId }));
      },
      onCall(record) {
        noteWorkingSync(db, {
          turnId,
          agentId,
          userId,
          step: record.step,
          tool: record.tool,
          note: `查过 ${record.args} → ${record.result.slice(0, 80)}`,
          now,
        });
      },
    });
    reply = outcome.reply;
    steps = outcome.steps;
    calls = outcome.calls;
    hitCap = outcome.hitCap;
  }

  reply = self
    ? correctSelfReply(reply, params.userName, params.agent.display_name)
    : correctOtherReply(reply, params.userName, params.agent.display_name);

  // 5. 轮末：最多再抽一条结构化记忆，然后跑一次归并去重，攒完落一次盘
  if (identified && plan && !plan.explicit) {
    const vectors = await embedOrNull([plan.fact], deps.embed);
    const out = rememberSync(db, {
      agentId,
      userId,
      fact: plan.fact,
      topic: plan.topic,
      importance: plan.importance,
      kind: plan.kind,
      vector: vectors?.[0] ?? null,
      now,
    });
    if (out.saved) written++;
  }
  if (identified) {
    runIdleMaintenanceSync(db, {
      agentId,
      userId,
      keepTurnId: turnId,
      now,
    });
  }
  if (personaSql) {
    db.run(
      `UPDATE agent_personas SET system_prompt = ?, updated_at = datetime('now') WHERE id = ?`,
      [personaSql, agentId],
    );
    written++;
  }
  await flush();

  return { reply: reply.trim(), turnId, steps, calls, hitCap, written, recallToken };
}

/** 私聊调用口：只要那句话 */
export async function runMemberTurn(
  params: Parameters<typeof runMemberTurnDetailed>[0],
): Promise<string> {
  return (await runMemberTurnDetailed(params)).reply;
}
