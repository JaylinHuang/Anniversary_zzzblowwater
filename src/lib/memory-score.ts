/**
 * 分层记忆的纯函数层：打分、主题归并、重要性判定、窗口压缩的安全检查。
 * 这里不碰数据库、不发请求，同样的输入永远给同样的输出。
 *
 * 检索分数 = 语义相似度 × 关键词加成 × 时间衰减 × 重要性。
 * 四项都是乘法：向量挂掉时语义项落到地板值，关键词那一路仍然能把专有名词捞回来。
 */

export type MemoryKind = "fact" | "summary";

/** 语义项的地板。向量不可用时这一项对所有记忆都一样，排序交给其余三项 */
export const SEMANTIC_FLOOR = 0.3;
/** 关键词全命中时最多把分数乘到 1 + KEYWORD_GAIN */
export const KEYWORD_GAIN = 1.6;
/** 只要命中一个关键词就先给这么多成的加成：问句里的虚词不该把专有名词摊薄 */
export const KEYWORD_HIT_BASE = 0.4;
/** 时间衰减半衰期（天） */
export const DECAY_HALF_LIFE_DAYS = 30;
/** 重要性映射到 [IMPORTANCE_BASE, IMPORTANCE_BASE + IMPORTANCE_GAIN] */
export const IMPORTANCE_BASE = 0.2;
export const IMPORTANCE_GAIN = 0.8;
/** 低于这个分的记忆淘汰出检索结果 */
export const MEMORY_SCORE_FLOOR = 0.04;

/** 用户点名「记住」的 */
export const IMPORTANCE_EXPLICIT = 1;
/** 救命、过敏、保密这类不能忘的 */
export const IMPORTANCE_CRITICAL = 0.9;
/** 用户自述的基本信息 */
export const IMPORTANCE_PROFILE = 0.6;
/** 日常闲聊 */
export const IMPORTANCE_CHAT = 0.3;
/** 降权的下限，再低也不删行，只是排不进结果 */
export const IMPORTANCE_MIN = 0.05;
/** 连续多少天没被检索就降一档 */
export const DECAY_IDLE_DAYS = 14;

/** 去掉空白和标点，只留汉字、字母、数字 */
export function compact(text: string): string {
  return text
    .replace(/\s+/g, "")
    .replace(/[^\u4e00-\u9fa5a-zA-Z0-9]/g, "")
    .toLowerCase();
}

export function cosineSim(a: number[] | null, b: number[] | null): number {
  if (!a?.length || !b?.length) return 0;
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
  const cos = dot / (Math.sqrt(na) * Math.sqrt(nb));
  return clamp01(cos);
}

export function clamp01(n: number): number {
  if (!Number.isFinite(n)) return 0;
  return Math.min(1, Math.max(0, n));
}

/** 这些二字组合到处都有，命中了说明不了相关 */
const STOP_TOKENS = new Set([
  "我的", "你的", "他的", "我们", "你们", "今天", "明天", "昨天", "一个",
  "什么", "知道", "记住", "别忘", "忘了", "请记", "然后", "就是", "没有",
  "怎么", "可以", "还是", "这个", "那个", "其实", "但是", "因为", "自己",
  "还有", "起来", "应该", "一下", "有点", "really", "please",
  // 问句里的虚词，命中了也说明不了相关
  "是谁", "谁啊", "谁呀", "哪个", "哪里", "哪儿", "多少", "几点", "为什",
]);

/**
 * 取出可以用来做关键词命中的片段：
 * 两位以上的字母串和数字串，加上汉字的二字组合与短词。
 */
export function memoryKeywords(text: string): string[] {
  const out = new Set<string>();
  for (const m of text.toLowerCase().matchAll(/[a-z]{2,}|\d{2,}/g)) {
    out.add(m[0]);
  }
  const runs = text.replace(/[^\u4e00-\u9fa5]/g, " ").split(/\s+/).filter(Boolean);
  for (const run of runs) {
    if (run.length >= 2 && run.length <= 3 && !STOP_TOKENS.has(run)) {
      out.add(run);
    }
    for (let i = 0; i + 2 <= run.length; i++) {
      const gram = run.slice(i, i + 2);
      if (!STOP_TOKENS.has(gram)) out.add(gram);
    }
  }
  return [...out];
}

/** 数字和外文串当专有名词看，权重更高：房间号、型号、ID 全靠它们捞回来 */
function tokenWeight(token: string): number {
  return /^[a-z]{2,}$|^\d{2,}$/.test(token) ? 1.5 : 1;
}

/** 关键词加成，范围 [1, 1 + KEYWORD_GAIN]。查询没有可用词时返回 1 */
export function keywordBoost(query: string, text: string): number {
  const want = memoryKeywords(query);
  if (!want.length) return 1;
  const have = new Set(memoryKeywords(text));
  let hit = 0;
  let total = 0;
  for (const token of want) {
    const weight = tokenWeight(token);
    total += weight;
    if (have.has(token)) hit += weight;
  }
  if (total === 0 || hit === 0) return 1;
  const ratio = hit / total;
  const strength = KEYWORD_HIT_BASE + (1 - KEYWORD_HIT_BASE) * ratio;
  return 1 + KEYWORD_GAIN * strength;
}

/** 时间衰减，(0, 1]，天数越大越小 */
export function timeDecay(ageDays: number): number {
  const age = Math.max(0, Number.isFinite(ageDays) ? ageDays : 0);
  return 1 / (1 + age / DECAY_HALF_LIFE_DAYS);
}

/** 重要性映射。再不重要也留一点，靠乘法里的其他项决定排序 */
export function importanceFactor(importance: number): number {
  return IMPORTANCE_BASE + IMPORTANCE_GAIN * clamp01(importance);
}

export function semanticFactor(similarity: number): number {
  return SEMANTIC_FLOOR + (1 - SEMANTIC_FLOOR) * clamp01(similarity);
}

/** 四项相乘。纯函数，同样输入同样输出 */
export function memoryScore(input: {
  similarity: number;
  keywordBoost: number;
  ageDays: number;
  importance: number;
}): number {
  return (
    semanticFactor(input.similarity) *
    Math.max(1, input.keywordBoost) *
    timeDecay(input.ageDays) *
    importanceFactor(input.importance)
  );
}

/** 长期没被检索就降一档重要性。不删行，只是越来越排不上 */
export function decayedImportance(
  importance: number,
  daysSinceHit: number,
): number {
  if (!Number.isFinite(daysSinceHit) || daysSinceHit < DECAY_IDLE_DAYS) {
    return importance;
  }
  const rounds = Math.floor(daysSinceHit / DECAY_IDLE_DAYS);
  const next = importance * Math.pow(0.7, rounds);
  return Math.max(IMPORTANCE_MIN, Number(next.toFixed(4)));
}

/** SQLite 的 datetime('now') 是 UTC 的 'YYYY-MM-DD HH:MM:SS' */
export function parseSqlTime(text: string | null | undefined): number {
  if (!text) return Number.NaN;
  const iso = `${String(text).trim().replace(" ", "T")}`;
  const withZone = /[zZ]|[+-]\d\d:?\d\d$/.test(iso) ? iso : `${iso}Z`;
  return new Date(withZone).getTime();
}

export function ageInDays(updatedAt: string | null, now: Date): number {
  const then = parseSqlTime(updatedAt);
  if (Number.isNaN(then)) return 0;
  return Math.max(0, (now.getTime() - then) / 86_400_000);
}

export type MemoryItem = {
  id: number;
  fact: string;
  topic: string;
  kind: MemoryKind;
  importance: number;
  updatedAt: string;
  vector: number[] | null;
  /** 被新事实取代的行，不再参与检索 */
  superseded: boolean;
};

export type ScoredMemory = MemoryItem & {
  score: number;
  similarity: number;
  boost: number;
  decay: number;
};

/**
 * 排序并淘汰。被取代的直接不参与；分数低于门槛的不进结果。
 * 分数相同时更新的排前面。
 */
export function rankMemories(params: {
  query: string;
  items: MemoryItem[];
  now: Date;
  queryVector?: number[] | null;
  limit?: number;
  floor?: number;
}): ScoredMemory[] {
  const floor = params.floor ?? MEMORY_SCORE_FLOOR;
  const scored: ScoredMemory[] = [];
  for (const item of params.items) {
    if (item.superseded) continue;
    const similarity = cosineSim(params.queryVector ?? null, item.vector);
    const boost = keywordBoost(params.query, item.fact);
    const ageDays = ageInDays(item.updatedAt, params.now);
    const decay = timeDecay(ageDays);
    const score = memoryScore({
      similarity,
      keywordBoost: boost,
      ageDays,
      importance: item.importance,
    });
    if (score < floor) continue;
    scored.push({ ...item, score, similarity, boost, decay });
  }
  scored.sort((a, b) => {
    if (Math.abs(a.score - b.score) > 1e-9) return b.score - a.score;
    if (a.updatedAt !== b.updatedAt) return a.updatedAt < b.updatedAt ? 1 : -1;
    return b.id - a.id;
  });
  const limit = params.limit ?? 6;
  return scored.slice(0, Math.max(1, limit));
}

/** 显式记忆指令 */
const REMEMBER_MARKER = /(请\s*记住|帮我记住|记住|记一下|记下来|记下|别忘了|别忘记|不要忘)/;

/** 对面说「记住……」时，取出后面那句事实 */
export function detectExplicitRemember(text: string): {
  explicit: boolean;
  fact: string;
} {
  const raw = (text || "").trim();
  const hit = raw.match(REMEMBER_MARKER);
  if (!hit) return { explicit: false, fact: "" };
  const after = raw
    .slice((hit.index ?? 0) + hit[0].length)
    .replace(/^[:：,，、。\s]+/, "")
    .trim();
  const fact = (after || raw.replace(REMEMBER_MARKER, "").trim() || raw).slice(
    0,
    180,
  );
  return { explicit: true, fact };
}

export function stripRememberMarker(text: string): string {
  const found = detectExplicitRemember(text);
  return found.explicit && found.fact ? found.fact : (text || "").trim();
}

/** 主题规则。同一主题的新事实就地取代旧事实，不并存两条打架的 */
const TOPIC_RULES: Array<[RegExp, string]> = [
  [/(改名|我叫|叫我|名字|昵称|称呼|网名)/, "称呼"],
  [/(房间|房号|门牌|几号楼)/, "房间"],
  [/(生日|出生|几岁|年龄)/, "生日"],
  [/(住在|家在|地址|老家)/, "住址"],
  [/(手机号|电话号|微信|邮箱)/, "联系方式"],
  [/(过敏|忌口|不吃|吃不了|药物)/, "身体忌讳"],
  [/(主玩|本命|主力|常用角色|练度)/, "常用角色"],
  [/(上班|工作|职业|专业|学校|上学)/, "工作学业"],
  [/(别告诉|不要告诉|保密|别说出去|别外传)/, "保密约定"],
];

/**
 * 「同一个大类下可以并存多件事」的主题：
 * 过敏花生和不吃香菜都属于身体忌讳，但互不矛盾，不能互相取代。
 * 这些主题必须再细分到具体对象，只有对象相同才算同一件事。
 */
const MULTI_VALUE_TOPICS = new Set(["身体忌讳", "联系方式", "保密约定"]);

/** 从句子里取一个具体对象，作为细分主题的后缀；取不到返回空串 */
function topicSubject(topic: string, clean: string): string {
  if (topic === "身体忌讳") {
    // 「对花生过敏」「对花生不过敏了」→ 花生
    const allergy = clean.match(
      /对(.{1,10}?)(?:严重|重度|有点)?(?:不再|没有|不)?过敏/,
    );
    if (allergy) return compact(allergy[1]);
    // 「不吃香菜」「现在能吃香菜了」→ 香菜
    const diet = clean.match(
      /(?:不能吃|不可以吃|不吃|吃不了|能吃|可以吃|敢吃|忌口)(.+?)(?:了|吧|啊|啦|，|。|,|\.|！|!|$)/,
    );
    if (diet) return compact(diet[1]);
    return "";
  }
  if (topic === "联系方式") {
    // 手机号、微信、邮箱是三件事，各占一条
    if (/(手机号|电话号)/.test(clean)) return "手机号";
    if (/微信/.test(clean)) return "微信";
    if (/邮箱/.test(clean)) return "邮箱";
    return "";
  }
  return "";
}

/**
 * 归一成主题键。没命中已知主题就退回原文指纹：
 * 宁可多留一条，也不要错误地把别的事实覆盖掉。
 * 允许并存多件事的大类（过敏、忌口、联系方式、保密约定）会细分到具体对象，
 * 例如「身体忌讳:花生」和「身体忌讳:香菜」是两个主题，互不取代。
 */
export function memoryTopic(text: string): string {
  const clean = stripRememberMarker(text);
  for (const [re, topic] of TOPIC_RULES) {
    if (!re.test(clean)) continue;
    if (!MULTI_VALUE_TOPICS.has(topic)) return topic;
    const subject = topicSubject(topic, clean);
    // 取不到对象时按原文指纹分开：不同的话不覆盖，只有一字不差才算同一句
    return `${topic}:${subject || compact(clean).slice(0, 24)}`;
  }
  return `原文:${compact(clean).slice(0, 24)}`;
}

/**
 * 把调用方（比如模型调 remember 时随手填的）粗粒度主题，按事实内容细分。
 * 粗主题「身体忌讳」会被拆成「身体忌讳:花生」；已经细分过或不是多值主题的原样返回。
 */
export function refineTopic(topic: string, fact: string): string {
  if (!MULTI_VALUE_TOPICS.has(topic)) return topic;
  const refined = memoryTopic(fact);
  if (refined.startsWith(`${topic}:`)) return refined;
  // 事实本身没落进这个大类时，按原文指纹分开，不让它去顶掉同大类的别的事
  return `${topic}:${compact(stripRememberMarker(fact)).slice(0, 24)}`;
}

/** 没有事实含量的附和、笑声和招呼 */
const FILLER_WORDS = new Set([
  "好的", "好吧", "行吧", "收到", "在吗", "晚安", "早安", "ok", "okk",
  "谢谢", "不客气", "没事", "随便", "草", "对对", "是的", "嗯嗯",
]);

export function isFillerText(text: string): boolean {
  const clean = compact(text);
  if (!clean) return true;
  if (FILLER_WORDS.has(clean)) return true;
  if (/^[哈呵嘿嘻啊哦嗯噢唉哇666]+$/.test(clean)) return true;
  if (/^\d$/.test(clean)) return true;
  // 只有一个字反复敲出来的，也算没说事
  return new Set(clean).size === 1 && clean.length <= 6;
}

const SELF_FACT =
  /(我[叫是在住有用玩]|我不吃|我过敏|我家|我主玩|我练|我上班|我在读|我的生日|咱们约|说好|约好|改名)/;
const CRITICAL_FACT =
  /(救命|急救|过敏|住院|生病|手术|报警|危险|别告诉|不要告诉|保密|别说出去|别外传)/;

/** 这句话里有没有值得长期记住的事实 */
export function hasFactContent(text: string): boolean {
  const clean = compact(stripRememberMarker(text));
  if (!clean || isFillerText(clean)) return false;
  if (clean.length < 4) return false;
  if (SELF_FACT.test(clean)) return true;
  if (CRITICAL_FACT.test(clean)) return true;
  if (/\d{2,}/.test(clean)) return true;
  return TOPIC_RULES.some(([re]) => re.test(clean));
}

export function classifyImportance(text: string, explicit: boolean): number {
  if (explicit) return IMPORTANCE_EXPLICIT;
  if (CRITICAL_FACT.test(text)) return IMPORTANCE_CRITICAL;
  if (SELF_FACT.test(text)) return IMPORTANCE_PROFILE;
  return IMPORTANCE_CHAT;
}

export type DraftMemory = {
  fact: string;
  topic: string;
  importance: number;
  kind: MemoryKind;
};

/**
 * 一轮结束最多抽一条。
 * 只看用户原话，不把分身自己的回复当事实；没有事实就返回 null，一条都不写。
 */
export function extractTurnMemory(params: {
  userText: string;
  userName?: string;
}): DraftMemory | null {
  const raw = (params.userText || "").trim();
  if (!raw) return null;
  const found = detectExplicitRemember(raw);
  const body = found.explicit && found.fact ? found.fact : raw;
  if (!hasFactContent(body)) return null;
  const who = (params.userName || "").trim();
  const fact = (who ? `${who}：${body}` : body).slice(0, 180);
  return {
    fact,
    topic: memoryTopic(body),
    importance: classifyImportance(body, found.explicit),
    kind: "fact",
  };
}

export type WindowMessage = { role: "user" | "assistant"; content: string };

/** 短期窗口超长时，旧的那段交给摘要，新的那段留在窗口里。泛型保留消息上的 id。 */
export function planWindowCompression<T extends WindowMessage>(
  messages: T[],
  maxMessages: number,
): { fold: T[]; keep: T[] } {
  const max = Math.max(2, maxMessages);
  if (messages.length <= max) return { fold: [], keep: messages };
  const cut = messages.length - max;
  return { fold: messages.slice(0, cut), keep: messages.slice(cut) };
}

const CONSTRAINT_PHRASES = [
  "别告诉别人",
  "别告诉",
  "不要告诉",
  "保密",
  "别说出去",
  "不要外传",
  "别外传",
  "只跟你说",
];

/** 压缩前必须原样带过去的东西：成串的数字，和这些关键约束 */
export function keyConstraints(text: string): string[] {
  const out = new Set<string>();
  for (const m of text.matchAll(/\d+(?:[.:：\-/]\d+)*/g)) {
    if (m[0].replace(/\D/g, "").length >= 2) out.add(m[0]);
  }
  for (const phrase of CONSTRAINT_PHRASES) {
    if (text.includes(phrase)) out.add(phrase);
  }
  return [...out];
}

export function foldedText(fold: WindowMessage[]): string {
  return fold
    .map((msg) => `${msg.role === "user" ? "对面" : "我"}：${msg.content}`)
    .join("\n");
}

/** 摘要丢了关键数字或关键约束就不接受，旧对话留在窗口里 */
export function acceptSummary(
  source: string,
  summary: string,
): { ok: boolean; missing: string[] } {
  const text = (summary || "").trim();
  if (!text) return { ok: false, missing: keyConstraints(source) };
  const missing = keyConstraints(source).filter((key) => !text.includes(key));
  return { ok: missing.length === 0, missing };
}
