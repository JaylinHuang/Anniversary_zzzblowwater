/**
 * 从问句里抽出要核对的事实，并在带时间的发言里决定以哪一条为准。
 * 人设和更早的发言打架时，留下较新的那条，供写回人设。
 */

export type DatedLine = {
  id: number;
  sender: string;
  qq: string;
  content: string;
  sentAt: string | null;
};

const LEADING = [
  "你现在是不是",
  "你现在在不在",
  "你到底",
  "到底是",
  "是不是",
  "有没有",
  "你现在在",
  "你现在是",
  "你现在",
  "你是不是",
  "在不在",
  "在上",
  "在读",
  "正在",
  "现在",
  "你是",
  "你在",
  "你的",
  "你们",
  "他是",
  "她是",
  "他在",
  "她在",
  "他的",
  "她的",
  "上",
].sort((a, b) => b.length - a.length);

const JUNK = [
  "你觉得",
  "这个群友",
  "厉不厉害",
  "喜不喜欢",
  "怎么样",
  "怎么看",
  "群友",
  "觉得",
  "现在",
  "什么",
  "怎么",
  "一下",
  "知道",
  "真的",
  "有点",
  "还是",
  "或者",
  "这个",
  "那个",
  "你们",
  "我们",
  "他们",
  "自己",
  "你",
  "我",
  "他",
  "她",
].sort((a, b) => b.length - a.length);

const TOPIC_STOP = new Set([
  "现在",
  "还是",
  "什么",
  "怎么",
  "群友",
  "觉得",
  "这个",
  "那个",
  "一下",
  "知道",
  "真的",
  "我们",
  "你们",
  "他们",
  "自己",
  "时候",
  "今天",
  "已经",
  "可以",
  "不是",
  "没有",
]);

const EXPAND: Record<string, string[]> = {
  高中: ["高一", "高二", "高三", "高中生"],
  初中: ["初一", "初二", "初三", "初中生"],
  大学: ["大一", "大二", "大三", "大四", "大学生"],
};

/** 检索用的词。高中会连带高一、高二，避免正文没写出「高中」两个字就漏掉 */
export function searchNeedles(needles: string[]): string[] {
  const out: string[] = [];
  for (const needle of needles) {
    out.push(needle);
    for (const extra of EXPAND[needle] || []) out.push(extra);
  }
  return unique(out).slice(0, 12);
}

function formsOf(needle: string): string[] {
  return unique([needle, ...(EXPAND[needle] || [])]);
}

const PATCH_START = "【群聊近况】";
const PATCH_END = "【近况结束】";

function unique(items: string[]): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const item of items) {
    if (!item || seen.has(item)) continue;
    seen.add(item);
    out.push(item);
  }
  return out;
}

function trimTopic(raw: string): string {
  let text = raw.trim();
  let changed = true;
  while (changed) {
    changed = false;
    for (const lead of LEADING) {
      if (text.startsWith(lead) && text.length - lead.length >= 2) {
        text = text.slice(lead.length);
        changed = true;
        break;
      }
    }
  }
  text = text.replace(/[吗呢啊呀吧了的]+$/g, "");
  if (text.length < 2 || text.length > 8) return "";
  if (TOPIC_STOP.has(text)) return "";
  return text;
}

/** 「A还是B」里的两个事实词。套话会先剥掉 */
export function topicAlternatives(talk: string): string[] {
  const compact = talk.replace(/\s+/g, "");
  const found: string[] = [];
  const re =
    /([\u4e00-\u9fa5A-Za-z0-9]{2,12})(?:还是|或者)([\u4e00-\u9fa5A-Za-z0-9]{2,12})/g;
  for (const match of compact.matchAll(re)) {
    const left = trimTopic(match[1] || "");
    const right = trimTopic(match[2] || "");
    if (left) found.push(left);
    if (right) found.push(right);
  }
  return unique(found).slice(0, 4);
}

function fallbackNeedles(talk: string, ignoreNames: string[]): string[] {
  let text = talk.replace(/[^\u4e00-\u9fa5A-Za-z0-9]/g, "");
  const names = [...ignoreNames].filter((name) => name.length >= 2);
  names.sort((a, b) => b.length - a.length);
  for (const name of names) text = text.split(name).join("");
  for (const word of JUNK) text = text.split(word).join("");
  if (text.length < 2 || text.length > 8) return [];
  const pieces = [text];
  if (text.length === 4) pieces.push(text.slice(0, 2), text.slice(2));
  return unique(pieces.filter((item) => item.length >= 2 && !TOPIC_STOP.has(item)));
}

/** 这一问要在群聊里找的词。有「还是」时只用那两个事实，避免套话把检索带偏 */
export function topicNeedles(talk: string, ignoreNames: string[] = []): string[] {
  const alts = topicAlternatives(talk);
  if (alts.length >= 2) return alts;
  return unique([...alts, ...fallbackNeedles(talk, ignoreNames)]).slice(0, 4);
}

/** 问句是在问分身自己，还是在问另一个群友 */
export function resolveSubject(
  talk: string,
  selfName: string,
  matchedNames: string[],
): "self" | "other" | "none" {
  const self = selfName.trim();
  const others = matchedNames.filter((name) => {
    const text = name.trim();
    if (!text) return false;
    if (!self) return true;
    return text !== self && !self.includes(text) && !text.includes(self);
  });
  if (others.length) return "other";
  if (self && matchedNames.some((name) => name === self || name.includes(self) || self.includes(name))) {
    return "self";
  }
  if (/你/.test(talk)) return "self";
  return "none";
}

function stance(content: string, needle: string): "yes" | "no" | "none" {
  const text = content.replace(/\s+/g, "");
  let denied = false;
  for (const form of formsOf(needle)) {
    const at = text.indexOf(form);
    if (at < 0) continue;
    const before = text.slice(Math.max(0, at - 4), at);
    if (/(?:没在|不是|没有|不上|不读|并非|不再|没上)/.test(before)) {
      denied = true;
      continue;
    }
    return "yes";
  }
  return denied ? "no" : "none";
}

/** 这句话是在承认这个事实，还是在否认 */
export function lineSupports(content: string, needle: string): boolean {
  return stance(content, needle) === "yes";
}

type StanceHit = { alt: string; yes: boolean };

function lineStance(content: string, alternatives: string[]): StanceHit | null {
  let denied: StanceHit | null = null;
  for (const alt of alternatives) {
    const kind = stance(content, alt);
    if (kind === "yes") return { alt, yes: true };
    if (kind === "no" && !denied) denied = { alt, yes: false };
  }
  return denied;
}

function timeKey(line: DatedLine): number {
  if (line.sentAt) {
    const parsed = Date.parse(line.sentAt.trim().replace(" ", "T"));
    if (!Number.isNaN(parsed)) return parsed;
  }
  return line.id;
}

export function formatWhen(sentAt: string | null): string {
  if (!sentAt) return "";
  return sentAt.trim().replace("T", " ").slice(0, 16);
}

function whenLabel(line: DatedLine): string {
  return formatWhen(line.sentAt) || `记录#${line.id}`;
}

function differentStance(a: StanceHit, b: StanceHit): boolean {
  return a.alt !== b.alt || a.yes !== b.yes;
}

function personaSupports(persona: string, alt: string): boolean {
  return lineSupports(persona, alt);
}

/** 人设里的说法和较新的发言不是同一件事 */
export function personaIsStale(
  persona: string,
  newer: DatedLine,
  alternatives: string[],
): boolean {
  const winner = lineStance(newer.content, alternatives);
  if (!winner) return false;
  if (winner.yes) {
    return alternatives.some((alt) => alt !== winner.alt && personaSupports(persona, alt));
  }
  return personaSupports(persona, winner.alt);
}

export function judgeTimeline(input: {
  persona: string;
  lines: DatedLine[];
  alternatives: string[];
}): {
  show: DatedLine[];
  patch: string | null;
  newer: DatedLine | null;
  older: DatedLine | null;
} {
  const alternatives = input.alternatives.filter((item) => item.length >= 2);
  const tagged = input.lines
    .map((line) => ({ line, hit: lineStance(line.content, alternatives) }))
    .filter((item): item is { line: DatedLine; hit: StanceHit } => Boolean(item.hit))
    .sort((a, b) => timeKey(b.line) - timeKey(a.line));
  if (!tagged.length) {
    const show = [...input.lines].sort((a, b) => timeKey(b) - timeKey(a)).slice(0, 6);
    return { show, patch: null, newer: show[0] || null, older: null };
  }
  const newer = tagged[0];
  const older =
    tagged.find(
      (item) =>
        differentStance(item.hit, newer.hit) && timeKey(item.line) < timeKey(newer.line),
    ) || null;
  const show: DatedLine[] = [newer.line];
  if (older) show.push(older.line);
  for (const item of tagged) {
    if (show.length >= 6) break;
    if (!show.some((line) => line.id === item.line.id)) show.push(item.line);
  }
  const stale = personaIsStale(input.persona, newer.line, alternatives);
  if (!stale) {
    return { show, patch: null, newer: newer.line, older: older?.line || null };
  }
  const topic = alternatives.join(" / ");
  const fresh = cleanFact(newer.line.content);
  const note = older
    ? `关于「${topic}」：以 ${whenLabel(newer.line)} 的发言为准：${fresh}。更早的 ${whenLabel(older.line)} 说法（${cleanFact(older.line.content)}）不再采用。`
    : `关于「${topic}」：人设里的旧说法和 ${whenLabel(newer.line)} 的发言不一致，以这条为准：${fresh}。`;
  return { show, patch: note, newer: newer.line, older: older?.line || null };
}

function cleanFact(content: string): string {
  return content.replace(/\s+/g, " ").trim().slice(0, 80);
}

/** 把近况写进人设。同一段会覆盖，不会越积越长 */
export function applyPersonaPatch(prompt: string, note: string): string {
  const block = `${PATCH_START}\n${note.trim()}\n${PATCH_END}`;
  if (prompt.includes(PATCH_START) && prompt.includes(PATCH_END)) {
    return prompt.replace(/【群聊近况】[\s\S]*?【近况结束】/, block);
  }
  return `${prompt.trim()}\n\n${block}`;
}

export function extractPersonaPatch(prompt: string): string {
  const matched = prompt.match(/【群聊近况】\n?([\s\S]*?)\n?【近况结束】/);
  return matched?.[1]?.trim() || "";
}
