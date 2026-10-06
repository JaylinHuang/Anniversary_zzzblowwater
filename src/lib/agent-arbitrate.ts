/** 多路结果的冲突监测与仲裁。纯函数，不访问数据库。 */

export type EvidenceSource = "chat" | "user" | "memory" | "consult" | "draft";

export type Claim = {
  source: EvidenceSource;
  text: string;
  polarity: "affirm" | "deny";
  topic: string;
  value: string | null;
};

export type Conflict = {
  topic: string;
  winnerSource: EvidenceSource | "none";
  winnerText: string;
  loserText: string;
};

/** 实时群聊高于用户原话，用户原话高于各分身的记忆和草稿 */
const RANK: Record<EvidenceSource, number> = {
  chat: 3,
  user: 2,
  draft: 1,
  memory: 0,
  consult: 0,
};

const DENY =
  /不是|没有|不会|不能|不去|别|并未|并非|不同意|没去|没来|不在/;

function sentences(text: string): string[] {
  return text
    .split(/[。！？!?\n]/)
    .map((item) => item.trim())
    .filter((item) => item.length >= 2);
}

function polarityOf(sentence: string): "affirm" | "deny" {
  return DENY.test(sentence) ? "deny" : "affirm";
}

function topicOf(sentence: string): string {
  return sentence
    .replace(DENY, "")
    .replace(/是|有|会|能|去|来|在|同意/g, "")
    .replace(/[^\u4e00-\u9fa5a-zA-Z0-9]/g, "")
    .slice(0, 16);
}

function numberClaim(sentence: string): { topic: string; value: string } | null {
  const matched = sentence.match(/([\u4e00-\u9fa5]{1,8})(\d{1,4})/);
  if (!matched) return null;
  return { topic: matched[1], value: matched[2] };
}

function isQuestion(text: string): boolean {
  return /[？?]|吗|呢/.test(text);
}

/** 从一段材料里抽出可比较的说法。问句不当成断言。 */
export function extractClaims(
  source: EvidenceSource,
  text: string,
): Claim[] {
  const claims: Claim[] = [];
  for (const sentence of sentences(text)) {
    if (source === "user" && isQuestion(sentence)) continue;
    const topic = topicOf(sentence);
    if (!topic) continue;
    const numbered = numberClaim(sentence);
    claims.push({
      source,
      text: sentence,
      polarity: polarityOf(sentence),
      topic: numbered?.topic || topic,
      value: numbered?.value ?? null,
    });
  }
  return claims;
}

function sameTopic(a: Claim, b: Claim): boolean {
  if (a.value && b.value) return a.topic === b.topic;
  const left = a.topic;
  const right = b.topic;
  if (left.length < 2 || right.length < 2) return left === right;
  return left.includes(right) || right.includes(left);
}

function contradicts(a: Claim, b: Claim): boolean {
  if (!sameTopic(a, b)) return false;
  if (a.value && b.value) return a.value !== b.value;
  return a.polarity !== b.polarity;
}

function prefer(a: Claim, b: Claim): Claim {
  if (RANK[a.source] !== RANK[b.source]) {
    return RANK[a.source] > RANK[b.source] ? a : b;
  }
  // 同为群聊时，先出现的是更新的一条
  return a;
}

/**
 * 找出不同来源里互相矛盾的说法。
 * 胜出顺序：实时群聊 > 用户原话里的断言 > 不再采用分身记忆或草稿。
 */
export function detectConflicts(groups: {
  source: EvidenceSource;
  text: string;
}[]): Conflict[] {
  const claims = groups.flatMap((group) => extractClaims(group.source, group.text));
  const conflicts: Conflict[] = [];
  const seen = new Set<string>();
  for (let i = 0; i < claims.length; i++) {
    for (let j = i + 1; j < claims.length; j++) {
      const left = claims[i];
      const right = claims[j];
      if (left.source === right.source && left.source !== "chat") continue;
      if (!contradicts(left, right)) continue;
      const winner = prefer(left, right);
      const loser = winner === left ? right : left;
      const winnerSource: Conflict["winnerSource"] =
        winner.source === "draft" ||
        winner.source === "memory" ||
        winner.source === "consult"
          ? "none"
          : winner.source;
      const key = `${winner.topic}|${loser.text}|${winner.text}`;
      if (seen.has(key)) continue;
      seen.add(key);
      conflicts.push({
        topic: winner.topic,
        winnerSource,
        winnerText: winnerSource === "none" ? "" : winner.text,
        loserText: loser.text,
      });
    }
  }
  return conflicts;
}

function dropSentence(reply: string, sentence: string): string {
  if (!sentence) return reply;
  return reply
    .split(/[。！？!?\n]/)
    .map((item) => item.trim())
    .filter((item) => item && !item.includes(sentence) && !sentence.includes(item))
    .join("。");
}

/**
 * 有冲突就改写回复：采信群聊原话，其次采信用户原话，两边记忆打架则两边都不用。
 */
export function arbitrateResults(input: {
  userText: string;
  chatText: string;
  memoryText: string;
  consultText: string;
  draft: string;
}): { conflicts: Conflict[]; reply: string } {
  const conflicts = detectConflicts([
    { source: "chat", text: input.chatText },
    { source: "user", text: input.userText },
    { source: "memory", text: input.memoryText },
    { source: "consult", text: input.consultText },
    { source: "draft", text: input.draft },
  ]);
  if (!conflicts.length) {
    return { conflicts, reply: input.draft.trim() };
  }

  let reply = input.draft.trim();
  const adopted: string[] = [];
  let droppedBoth = false;
  for (const conflict of conflicts) {
    reply = dropSentence(reply, conflict.loserText);
    if (conflict.winnerSource === "none") {
      reply = dropSentence(reply, conflict.winnerText);
      droppedBoth = true;
      continue;
    }
    if (!reply.includes(conflict.winnerText)) {
      adopted.push(conflict.winnerText);
    }
  }
  const pieces = [...adopted];
  if (reply.trim()) pieces.push(reply.trim());
  if (droppedBoth) {
    pieces.push("几边说法互相矛盾，又没有群聊原话，我先不把任何一边当成事实");
  }
  const merged = pieces.filter(Boolean).join("。").replace(/。+/g, "。");
  return { conflicts, reply: merged || input.userText };
}

/** 模型改写之后是否还把落败的说法留在回复里 */
export function replyHonorsVerdict(reply: string, conflicts: Conflict[]): boolean {
  return conflicts.every((conflict) => {
    if (conflict.loserText && reply.includes(conflict.loserText)) return false;
    if (conflict.winnerText && !reply.includes(conflict.winnerText)) return false;
    return true;
  });
}
