import { randomBytes } from "crypto";
import { GROUP_NAME } from "@/lib/constants";
import { getDb, rowFrom, rowsFrom, withDb } from "@/lib/db";
import { chatCompletion, isLlmConfigured } from "@/lib/llm";
import {
  arbitrateResults,
  replyHonorsVerdict,
} from "@/lib/agent-arbitrate";
import { isAgentCorpusText } from "@/lib/chat-parser";
import { formatRagBlock, retrieveRagForQq } from "@/lib/rag";
import { listAgentGroupChat } from "@/lib/roster";
import { formatSpeakStyle, loadSpeakStyle } from "@/lib/speak-stats";

/** 固定职责。同一轮里每个角色只能出现一次，避免任务重叠。 */
export const CORE_ROLES = ["memory", "corpus", "voice", "consistency"] as const;

export type CrewTask = {
  role: string;
  scope: string;
};

export type RosterPeer = {
  id: number;
  name: string;
  qq: string;
};

/** QQ 在库里可能是数字也可能是字符串，比对前先归一 */
export function sameQq(a: string | number | null | undefined, b: string | number | null | undefined): boolean {
  const left = String(a ?? "").replace(/\D/g, "");
  const right = String(b ?? "").replace(/\D/g, "");
  return left.length >= 5 && left === right;
}

/** 网站用户名、群名片、分身名字。QQ 相同则对方就是分身本人 */
export function formatSpeakerIdentity(
  userName: string,
  aliases: string[],
  options?: { self?: boolean; agentName?: string },
): string {
  const names = [
    ...new Set(
      [userName, ...aliases, options?.agentName || ""]
        .map((item) => item.trim())
        .filter(Boolean),
    ),
  ];
  const shown = names.map((item) => `「${item}」`).join("、");
  if (options?.self) {
    const card = options.agentName?.trim();
    const cardBit =
      card && card !== userName ? `这张卡叫「${card}」。` : "";
    return `当前这位用户就是你本人，不是另一个群友。网站用户名是「${userName}」。${cardBit}QQ 号相同。问「我是谁」时只回答「你就是我」，用「你」称呼。禁止说「群里那个」。这条身份高于已确认事实、群聊摘录和上一轮回复。`;
  }
  return `正在对话的人，网站用户名是「${userName}」。他就是「${GROUP_NAME}」里的群友，不是站外的另一个人。群聊记录里发送者写成 ${shown} 的，都是他本人。其他发送者才是别人。`;
}

/** 把本人说成群里另一个人时，改成承认对方就是自己 */
export function correctSelfReply(
  reply: string,
  userName: string,
  agentName: string,
): string {
  const text = reply.replace(/^\s*\[回复消息\]\s*/, "").trim();
  const namesSelf = /你就是|就是我|是我本人/.test(text);
  const talksAboutUser = Boolean(userName) && text.includes(userName);
  if (!/群里那个/.test(text) && !(talksAboutUser && !namesSelf)) return text;
  const card = agentName.trim();
  if (card && card !== userName) {
    return `你就是我。群名片是${userName}，这张卡叫${card}。`;
  }
  return `你就是我。`;
}

export const AGENT_HARD_RULES = [
  "硬性边界：",
  "1. 下面材料没写的时间、数字、人名、地点、原因、结论，一个字都不要补。",
  "2. 材料不够就说「这我没在群里确认过」，禁止用应该、可能、大概把空缺说成事实。",
  "3. 不要把别人的发言说成自己的经历，不要编造群里没出现过的约定、战绩或隐私。",
  "4. 对方在问事实或数据时，只转述材料里的原话要点，不加戏。",
].join("\n");

/** 问答和数据查询稍收一点，闲聊再松一些；事实边界靠硬性规则，不靠把温度压死 */
export function replyTemperature(userText: string): number {
  const text = userText.trim();
  const factual =
    /[？?]|吗|呢|么|是不是|有没有|多少|几个|什么时候|何时|哪|谁|查询|数据|统计|记录|次数/.test(
      text,
    );
  return factual ? 0.55 : 0.85;
}

const CORE_SCOPES: Record<(typeof CORE_ROLES)[number], string> = {
  memory: "只读取本分身已经确认的事实，不起草给用户的回复",
  corpus: "只检索本分身的群聊原话，不写记忆、不起草回复",
  voice: "只用本轮任务仓库里的材料，以本人语气回答当前这位用户",
  consistency:
    "核对多路结果。冲突时以实时群聊为准，其次是用户原话，通过后写回一条事实",
};

/** 调度中心的默认拆法：四项职责互不覆盖 */
export function defaultCrewPlan(): CrewTask[] {
  return CORE_ROLES.map((role) => ({ role, scope: CORE_SCOPES[role] }));
}

/**
 * 提问里点到其他群友时，把那一句单独交给对方，不让当前分身再答同一句。
 * 同一句里出现两个人，范围会重叠，调用方应放弃这次协作拆分。
 */
export function consultPlan(
  question: string,
  selfName: string,
  peers: RosterPeer[],
): CrewTask[] {
  const parts = question
    .split(/[？?！!。\n]/)
    .map((s) => s.trim())
    .filter(Boolean);
  const tasks: CrewTask[] = [];
  for (const peer of peers) {
    if (!peer.name || peer.name === selfName) continue;
    if (!question.includes(peer.name)) continue;
    const clause = parts.find((p) => p.includes(peer.name));
    if (!clause) continue;
    tasks.push({
      role: `consult:${peer.id}`,
      scope: `只提供「${peer.name}」对「${clause}」已确认的事实，不直接回复用户`,
    });
  }
  return tasks;
}

/** 拒绝重复角色或重复范围。consult 必须带分身编号。 */
export function assertDisjointPlan(tasks: CrewTask[]): CrewTask[] {
  const roles = new Set<string>();
  const scopes = new Set<string>();
  for (const task of tasks) {
    const consult = /^consult:\d+$/.test(task.role);
    const core = (CORE_ROLES as readonly string[]).includes(task.role);
    if (!consult && !core) {
      throw new Error(`未知子任务：${task.role}`);
    }
    if (roles.has(task.role)) {
      throw new Error(`任务重叠：${task.role} 被分配了两次`);
    }
    const scope = task.scope.trim();
    if (!scope) throw new Error("子任务缺少范围");
    if (scopes.has(scope)) {
      throw new Error("任务重叠：两个子任务的范围相同");
    }
    roles.add(task.role);
    scopes.add(scope);
  }
  if (!roles.has("voice") || !roles.has("consistency")) {
    throw new Error("调度结果缺少发言或校验");
  }
  return tasks;
}

/** 拼出一轮任务。协作拆分若重叠，就退回只有当前分身的四项职责。 */
export function buildCrewPlan(
  question: string,
  selfName: string,
  peers: RosterPeer[],
): CrewTask[] {
  const base = defaultCrewPlan();
  try {
    const consults = consultPlan(question, selfName, peers);
    return assertDisjointPlan([...base, ...consults]);
  } catch {
    return assertDisjointPlan(base);
  }
}

type MemoryRow = {
  fact: string;
  source_name: string;
};

/** 校验员：草稿为空时用已确认事实顶上，避免各说各话 */
export function alignReplyWithFacts(draft: string, facts: string[]): string {
  const text = draft.trim();
  if (text) return text;
  const fact = facts.find((item) => item.trim());
  if (!fact) return "这件事我还没有确认过。";
  return `我确认过的是：${fact}`;
}

async function readTaskOutput(turnId: string, role: string): Promise<string> {
  const db = await getDb();
  return (
    rowFrom<{ output: string }>(
      db,
      `SELECT output FROM agent_task_runs WHERE turn_id = ? AND role = ?`,
      [turnId, role],
    )?.output || ""
  );
}

async function writeTask(
  turnId: string,
  agentId: number,
  userId: number,
  role: string,
  scope: string,
  output: string,
) {
  await withDb((db) => {
    db.run(
      `INSERT INTO agent_task_runs
         (turn_id, agent_id, user_id, role, scope, status, output, updated_at)
       VALUES (?, ?, ?, ?, ?, 'done', ?, datetime('now'))
       ON CONFLICT(turn_id, role) DO UPDATE SET
         scope = excluded.scope,
         status = 'done',
         output = excluded.output,
         updated_at = datetime('now')`,
      [turnId, agentId, userId, role, scope, output],
    );
  });
}

async function loadSharedFacts(agentId: number): Promise<MemoryRow[]> {
  const db = await getDb();
  return rowsFrom<MemoryRow>(
    db,
    `SELECT fact, source_name FROM agent_shared_memory
     WHERE agent_id = ? ORDER BY id DESC LIMIT 30`,
    [agentId],
  );
}

function formatFacts(rows: MemoryRow[]): string {
  if (!rows.length) return "（还没有已确认事实）";
  return rows
    .map((row, i) => {
      const who = row.source_name ? `，当时在和${row.source_name}说话` : "";
      return `${i + 1}. ${row.fact}${who}`;
    })
    .join("\n");
}

async function rememberFact(
  agentId: number,
  userId: number,
  userName: string,
  fact: string,
) {
  const text = fact.trim().slice(0, 180);
  if (text.length < 4) return;
  await withDb((db) => {
    const dup = rowFrom(
      db,
      `SELECT 1 as x FROM agent_shared_memory WHERE agent_id = ? AND fact = ?`,
      [agentId, text],
    );
    if (dup) return;
    db.run(
      `INSERT INTO agent_shared_memory
         (agent_id, fact, source_user_id, source_name)
       VALUES (?, ?, ?, ?)`,
      [agentId, text, userId, userName],
    );
    db.run(
      `DELETE FROM agent_shared_memory
       WHERE agent_id = ? AND id NOT IN (
         SELECT id FROM agent_shared_memory
         WHERE agent_id = ? ORDER BY id DESC LIMIT 30
       )`,
      [agentId, agentId],
    );
  });
}

/**
 * 一轮单聊：调度中心拆任务，子任务读写同一份任务仓库，
 * 记忆按分身共享，并标明是在跟哪位用户说话。
 */
export async function runMemberCrew(params: {
  agent: {
    id: number;
    qq: string;
    display_name: string;
    system_prompt: string;
  };
  userId: number;
  userName: string;
  userQq: string | null;
  /** 这个用户在群归档里出现过的发送者名，含网站用户名 */
  userAliases: string[];
  userText: string;
  history: { role: string; content: string }[];
  peers: RosterPeer[];
}): Promise<string> {
  const turnId = randomBytes(8).toString("hex");
  const plan = buildCrewPlan(
    params.userText,
    params.agent.display_name,
    params.peers,
  );
  await writeTask(
    turnId,
    params.agent.id,
    params.userId,
    "dispatcher",
    "拆分提问并保证子任务范围不重叠",
    plan.map((task) => `${task.role}：${task.scope}`).join("\n"),
  );

  const facts = await loadSharedFacts(params.agent.id);
  const memoryOutput = formatFacts(facts);
  const memoryTask = plan.find((task) => task.role === "memory")!;
  await writeTask(
    turnId,
    params.agent.id,
    params.userId,
    memoryTask.role,
    memoryTask.scope,
    memoryOutput,
  );

  const liveLines: string[] = [];
  const recent = await listAgentGroupChat(params.agent.qq, 12);
  for (const row of recent) {
    if (isAgentCorpusText(row.content)) liveLines.push(row.content);
  }
  let corpusOutput = "（没有召回到可用的群聊原话）";
  try {
    const hits = await retrieveRagForQq(params.agent.qq, params.userText);
    const block = formatRagBlock(hits);
    if (block) corpusOutput = block;
  } catch {
    /* 没有向量接口时，语料任务留空，不阻塞其他人 */
  }
  const corpusTask = plan.find((task) => task.role === "corpus")!;
  await writeTask(
    turnId,
    params.agent.id,
    params.userId,
    corpusTask.role,
    corpusTask.scope,
    corpusOutput,
  );

  const consultBlocks: string[] = [];
  for (const task of plan) {
    if (!task.role.startsWith("consult:")) continue;
    const peerId = Number(task.role.slice("consult:".length));
    const peer = params.peers.find((item) => item.id === peerId);
    const peerFacts = await loadSharedFacts(peerId);
    if (peer) {
      const peerChat = await listAgentGroupChat(peer.qq, 8);
      for (const row of peerChat) {
        if (isAgentCorpusText(row.content)) {
          liveLines.push(`${peer.name}：${row.content}`);
        }
      }
    }
    const output = peer
      ? `「${peer.name}」的已确认事实：\n${formatFacts(peerFacts)}`
      : "没有找到被点名的分身";
    await writeTask(
      turnId,
      params.agent.id,
      params.userId,
      task.role,
      task.scope,
      output,
    );
    consultBlocks.push(output);
  }

  const sharedMemory = await readTaskOutput(turnId, "memory");
  const sharedCorpus = await readTaskOutput(turnId, "corpus");
  const consultText = consultBlocks.join("\n\n");
  let draft: string;
  if (!isLlmConfigured()) {
    draft = `（未配置大模型）${params.agent.display_name}对${params.userName}说：收到「${params.userText.slice(0, 40)}」。`;
  } else {
    const self = sameQq(params.userQq, params.agent.qq);
    const askingWho = /我是谁/.test(params.userText);
    const history = params.history
      .slice(-16)
      .filter((line) => !(self && line.role !== "user" && /群里那个/.test(line.content)))
      .map((line) => ({
        role: (line.role === "user" ? "user" : "assistant") as
          | "user"
          | "assistant",
        content: line.content,
      }));
    const memoryForModel = self
      ? sharedMemory
          .split("\n")
          .filter((line) => !/群里那个/.test(line))
          .join("\n")
      : sharedMemory;
    const corpusForModel = self && askingWho
      ? "这一问只确认对方是不是你本人，不要引用群聊摘录。"
      : sharedCorpus;
    const speakStyle = await loadSpeakStyle(params.agent.qq);
    draft = await chatCompletion(
      [
        {
          role: "system",
          content: [
            formatSpeakerIdentity(params.userName, params.userAliases, {
              self,
              agentName: params.agent.display_name,
            }),
            params.agent.system_prompt,
            speakStyle ? formatSpeakStyle(speakStyle) : "",
            `你是「${GROUP_NAME}」里的「${params.agent.display_name}」。所有用户面对的是同一个你，记忆只有一份。`,
            AGENT_HARD_RULES,
            "用这个人平时说话的方式回，优先短句和材料里出现过的说法。不要写成客服、旁白或人物介绍。不要输出「[回复消息]」这类导出标记。",
            "只根据下面任务仓库里的材料回答。材料没写的事不要编成已经确认的事实。",
            `已确认事实：\n${memoryForModel}`,
            corpusForModel,
            consultText,
          ]
            .filter(Boolean)
            .join("\n\n"),
        },
        ...history,
        { role: "user", content: params.userText },
      ],
      { temperature: replyTemperature(params.userText), maxTokens: 500 },
    );
  }
  const voiceTask = plan.find((task) => task.role === "voice")!;
  await writeTask(
    turnId,
    params.agent.id,
    params.userId,
    voiceTask.role,
    voiceTask.scope,
    draft,
  );

  const voiceOutput = await readTaskOutput(turnId, "voice");
  const chatText = [...liveLines, sharedCorpus].filter(Boolean).join("\n");
  const verdict = arbitrateResults({
    userText: params.userText,
    chatText,
    memoryText: sharedMemory,
    consultText,
    draft: voiceOutput,
  });
  let reply = verdict.reply || alignReplyWithFacts(
    voiceOutput,
    facts.map((row) => row.fact),
  );
  await writeTask(
    turnId,
    params.agent.id,
    params.userId,
    "arbiter",
    "冲突时采用实时群聊，其次采用用户原话",
    verdict.conflicts.length
      ? verdict.conflicts
          .map((item) =>
            item.winnerSource === "none"
              ? `「${item.topic}」多方矛盾，两边都不用`
              : `「${item.topic}」采信${item.winnerSource === "chat" ? "群聊" : "用户原话"}：${item.winnerText}`,
          )
          .join("\n")
      : "没有发现矛盾",
  );
  if (verdict.conflicts.length && isLlmConfigured()) {
    try {
      const rewritten = await chatCompletion(
        [
          {
            role: "system",
            content: [
              AGENT_HARD_RULES,
              "你是仲裁员。只输出最终要发给用户的那段话，不要解释。",
              "多方说法冲突时，必须采用实时群聊里的原话。群聊没写的，再遵守用户原来的提问，不要改问别的事。",
              "分身记忆和草稿若与上面两条相反，丢掉，不要折中。",
              `用户原话：${params.userText}`,
              `实时群聊：\n${chatText}`,
              `仲裁记录：\n${verdict.conflicts
                .map((item) =>
                  item.winnerText
                    ? `采信：${item.winnerText}`
                    : `不要采用：${item.loserText}`,
                )
                .join("\n")}`,
            ].join("\n\n"),
          },
          { role: "user", content: `待仲裁草稿：\n${voiceOutput}` },
        ],
        { temperature: replyTemperature(params.userText), maxTokens: 500 },
      );
      reply = replyHonorsVerdict(rewritten, verdict.conflicts)
        ? rewritten
        : verdict.reply;
    } catch {
      reply = verdict.reply;
    }
  }
  if (sameQq(params.userQq, params.agent.qq)) {
    reply = correctSelfReply(reply, params.userName, params.agent.display_name);
  } else {
    reply = reply.replace(/^\s*\[回复消息\]\s*/, "").trim();
  }
  const consistencyTask = plan.find((task) => task.role === "consistency")!;
  await writeTask(
    turnId,
    params.agent.id,
    params.userId,
    consistencyTask.role,
    consistencyTask.scope,
    reply,
  );
  await rememberFact(
    params.agent.id,
    params.userId,
    params.userName,
    `对${params.userName}说过：${reply.replace(/\s+/g, " ").slice(0, 120)}`,
  );
  return reply.trim();
}
