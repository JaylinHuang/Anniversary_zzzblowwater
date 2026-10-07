import { GROUP_NAME } from "@/lib/constants";

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

/** 把「对面就是我本人」说成事实的句子。只对 QQ 相同的那一位成立。 */
const SELF_IDENTITY_CLAIM =
  /你就是我|就是你本人|是我本人|咱们是同一个人|你跟我是一个人/;

export function claimsSelfIdentity(text: string): boolean {
  return SELF_IDENTITY_CLAIM.test(text);
}

/**
 * 网站用户名和群名片。只有 QQ 相同，对面才是分身本人。
 * 分身自己的卡名不能写进其他用户的别名，否则每个人都会被当成同一个人。
 */
export function formatSpeakerIdentity(
  userName: string,
  aliases: string[],
  options?: { self?: boolean; agentName?: string },
): string {
  const agentName = options?.agentName?.trim() || "";
  if (options?.self) {
    const cardBit =
      agentName && agentName !== userName ? `这张卡叫「${agentName}」。` : "";
    return `当前这位用户就是你本人，不是另一个群友。网站用户名是「${userName}」。${cardBit}QQ 号相同。问「我是谁」时只回答「你就是我」，用「你」称呼。禁止说「群里那个」。这条身份只对现在这位成立，高于已确认事实、群聊摘录和上一轮回复。`;
  }
  const names = [
    ...new Set(
      [userName, ...aliases]
        .map((item) => item.trim())
        .filter((item) => item && item !== agentName),
    ),
  ];
  const shown = (names.length ? names : [userName.trim() || "这位用户"])
    .map((item) => `「${item}」`)
    .join("、");
  const cardBit = agentName ? `你是「${agentName}」。` : "";
  return `${cardBit}当前这位用户不是你本人。网站用户名是「${userName}」。他是「${GROUP_NAME}」里的另一位群友。群聊记录里发送者写成 ${shown} 的，才是他。你自己的名片不要算进他的名字。已确认事实里对别人说过的「你就是我」，只对当时那位 QQ 相同的用户成立，不要套到现在这位。`;
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

/** 对 QQ 不同的用户，丢掉把对方说成自己的句子 */
export function correctOtherReply(
  reply: string,
  userName: string,
  agentName: string,
): string {
  const text = reply.replace(/^\s*\[回复消息\]\s*/, "").trim();
  const parts = text
    .split(/(?<=[。！？!?])/)
    .map((item) => item.trim())
    .filter(Boolean);
  if (!parts.some((item) => claimsSelfIdentity(item))) return text;
  const kept = parts
    .filter((item) => !claimsSelfIdentity(item) && !/群名片是|这张卡叫/.test(item))
    .join("");
  if (kept) return kept;
  const you = userName.trim() || "你";
  const me = agentName.trim() || "我";
  return `你是${you}，我是${me}。咱们不是同一个人。`;
}

export const AGENT_HARD_RULES = [
  "硬性边界：",
  "1. 没出现过的时间、数字、人名、地点、约定、战绩和隐私，一个字都不要补。对方在核对这类事实、材料里又没有时，说你不记得这件事；禁止用应该、可能、大概把空缺说成事实。",
  "2. 问某个群友怎么样、厉不厉害时，先看这一轮给出的群聊发言，用你自己的口气给看法。印象要对上他自己怎么说、别人怎么说他。发言里没有的战绩和水平不要编，也不要整句贴原话。",
  "3. 回复必须接住对方这一句。检索到的句子如果答非所问，不要把它当成回答。认识群友只靠群聊归档，不要用网站上的群友名片。",
  "4. 别人的发言是你在群里听见的，不要写成你自己的经历。",
  "5. 问你自己或问别的群友的事实时，先看这一轮群聊发言里的时间。发言之间矛盾，或和人设矛盾时，以时间更晚的那条为准来回答。问的是你自己，就用你的口气按这条说，不要说成把人记混了。",
].join("\n");

/** 问看法时放开一点，核对事实时收着；事实边界靠硬性规则，不靠把温度压死 */
export function replyTemperature(userText: string): number {
  const text = userText.trim();
  const opinion =
    /觉得|感觉|看法|怎么样|怎么看|喜不喜欢|爱不爱|怎么想/.test(text);
  if (opinion) return 0.85;
  const factual =
    /[？?]|吗|呢|是不是|有没有|多少|几个|什么时候|何时|哪|谁|查询|数据|统计|记录|次数/.test(
      text,
    );
  return factual ? 0.55 : 0.85;
}

const CORE_SCOPES: Record<(typeof CORE_ROLES)[number], string> = {
  memory: "只读取当前这位用户名下的长期记忆，不起草给用户的回复",
  corpus: "只检索本分身的群聊原话，不写记忆、不起草回复",
  voice: "只用本轮任务仓库里的材料，以本人语气回答当前这位用户",
  consistency:
    "核对多路结果。冲突时以实时群聊为准，其次是用户原话，不写长期记忆",
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

/** 校验员：草稿为空时用已确认事实顶上，避免各说各话 */
export function alignReplyWithFacts(draft: string, facts: string[]): string {
  const text = draft.trim();
  if (text) return text;
  const fact = facts.find((item) => item.trim());
  if (!fact) return "这件事我还没有确认过。";
  return `我确认过的是：${fact}`;
}
