import { COMMON_WORD_TEXT } from "@/lib/wordcloud-dict";

export type CloudWord = { word: string; count: number };

/**
 * 词云清洗。
 * 中英文都收，不再把汉字卡在 2～4 个字。
 * 先挖掉群名，再按虚词切开；超过 4 个字才用常用词表切开。
 * 词表里没有的人名整段保留，不再滑成「席鉴 / 鉴本」。
 * 只有切不开、又超过 24 个字的整段才丢掉。
 */

// 虚词和代词：用来切开，不单独成词
const GLUE = new Set(
  "的了呢啊吧吗呀哦嗯着过在是有把被让给和跟与或也就都还又很太更最这那我你他她它没不而及对从到为以但如所因若则且并么哈想说里去来看做讲聊问听",
);

// 切开之后仍会整段留下、但没有检索价值的说法
const STOP = new Set([
  "时候",
  "时间",
  "小时",
  "今日",
  "今天",
  "明天",
  "昨天",
  "现在",
  "知道",
  "觉得",
  "可以",
  "真的",
  "一下",
  "一点",
  "自己",
  "然后",
  "已经",
  "因为",
  "所以",
  "但是",
  "如果",
  "不过",
  "就是",
  "还是",
  "不是",
  "没有",
  "什么",
  "怎么",
  "这个",
  "那个",
  "一个",
  "我们",
  "你们",
  "他们",
  "这样",
  "那样",
  "这里",
  "那里",
  "出来",
  "进去",
  "回来",
  "哈哈",
  "呵呵",
  "嘿嘿",
  "好的",
  "好吧",
  "行吧",
  "谢谢",
  "看看",
  "东西",
  "地方",
  "其实",
  "应该",
  "可能",
  "好像",
  "真是",
  "难道",
  "到底",
  "而且",
  "或者",
  "一起",
  "一直",
  "一样",
  "一般",
  "于是",
]);

// 切开之后仍会整段留下、但没有检索价值的英文虚词。大小写已合并
const EN_STOP = new Set([
  "a", "an", "the", "of", "to", "in", "on", "or", "is", "it", "be", "as", "at",
  "by", "we", "he", "me", "my", "and", "you", "for", "are", "was", "not", "but",
  "with", "this", "that", "have", "from", "they", "what", "your", "just", "like",
  "its", "about", "there", "their", "would", "could", "should", "been", "were",
  "will", "can", "all", "any", "our", "out", "get", "got", "how", "who", "why",
  "when", "where", "which", "than", "then", "them", "his", "her", "she", "him",
  "has", "had", "did", "does", "dont", "im", "ive", "youre", "also",
  "into", "over", "after", "before", "because", "really", "very", "some",
]);

// 词尾口头禅。后面还连着字的「操场 / 操作」不算口头禅
const CAO_WORDS = ["操场", "操作", "操心", "操办", "操持", "操劳", "操纵", "操盘", "操练"];

// 词表里没收录、但希望整词保住的说法
const EXTRA_WORDS = ["天青色", "格莉丝", "绝区零", "席德"];

// 只丢掉一整句，不限制正常词的字数
const MAX_HAN = 24;
const MAX_LATIN = 32;

let dictionary: Set<string> | null = null;

function commonDictionary(): Set<string> {
  if (dictionary) return dictionary;
  const words = new Set<string>();
  for (const word of COMMON_WORD_TEXT.split("\n")) {
    if (word) words.add(word);
  }
  for (const word of EXTRA_WORDS) words.add(word);
  dictionary = words;
  return words;
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function groupPieces(name: string): Set<string> {
  // 群名本身，以及其中任意连续汉字，避免「吹水」「水群」再被算进去
  const pieces = new Set<string>();
  const raw = name.trim();
  if (!raw) return pieces;
  pieces.add(raw.toLowerCase());
  const chars = raw.match(/[\u4e00-\u9fff]/g)?.join("") ?? "";
  for (let n = 2; n <= chars.length; n += 1) {
    for (let i = 0; i <= chars.length - n; i += 1) {
      pieces.add(chars.slice(i, i + n));
    }
  }
  for (const token of raw.match(/[A-Za-z]{2,}/g) ?? []) {
    pieces.add(token.toLowerCase());
  }
  return pieces;
}

function stripLoose(text: string, token: string): string {
  const compact = token.replace(/\s+/g, "");
  if ([...compact].length < 2) return text;
  const pattern = [...compact].map((ch) => escapeRegExp(ch)).join("\\s*");
  const flags = /[A-Za-z]/.test(compact) ? "gi" : "g";
  return text.replace(new RegExp(pattern, flags), "");
}

function stripNoise(text: string, pieces: Set<string>, names: string[]): string {
  let out = text.replace(/[\u200b\uFEFF]/g, "");
  out = out.replace(/\[[^\]]*\]/g, "");
  out = out.replace(/https?:\/\/\S+/gi, "");
  out = out.replace(/@\S+/g, "");
  const ordered = [...names].filter(Boolean).sort((a, b) => b.length - a.length);
  for (const name of ordered) {
    out = stripLoose(out, name);
    const han = name.match(/[\u4e00-\u9fff]/g)?.join("") ?? "";
    if ([...han].length >= 2) out = stripLoose(out, han);
  }
  const hanPieces = [...pieces]
    .filter((piece) => /^[\u4e00-\u9fff]{2,}$/.test(piece))
    .sort((a, b) => b.length - a.length);
  for (const piece of hanPieces) {
    out = out.split(piece).join("");
  }
  return out;
}

function chunksOf(text: string): string[] {
  const out: string[] = [];
  let buf = "";
  for (const ch of text) {
    if (ch >= "\u4e00" && ch <= "\u9fff" && !GLUE.has(ch)) {
      buf += ch;
      continue;
    }
    if (buf) {
      out.push(buf);
      buf = "";
    }
  }
  if (buf) out.push(buf);
  return out;
}

function splitTic(chunk: string): string[] {
  // 把粘在词尾的「操」撕开丢掉，只留下前面的说法
  const parts: string[] = [];
  let buf = "";
  let i = 0;
  while (i < chunk.length) {
    const kept = CAO_WORDS.find((word) => chunk.startsWith(word, i)) ?? "";
    if (kept) {
      if (buf) {
        parts.push(buf);
        buf = "";
      }
      parts.push(kept);
      i += kept.length;
      continue;
    }
    if (chunk[i] === "操") {
      if (buf) {
        parts.push(buf);
        buf = "";
      }
      i += 1;
      continue;
    }
    buf += chunk[i];
    i += 1;
  }
  if (buf) parts.push(buf);
  return parts;
}

function cutStops(chunk: string): string[] {
  let parts = [chunk];
  const stops = [...STOP].sort((a, b) => b.length - a.length);
  for (const stop of stops) {
    const next: string[] = [];
    for (const part of parts) next.push(...part.split(stop));
    parts = next;
  }
  return parts.filter(Boolean);
}

function segmentLong(chunk: string, pieces: Set<string>): string[] {
  const dict = commonDictionary();
  const out: string[] = [];
  let unknown = "";
  const flush = () => {
    if ([...unknown].length >= 2) out.push(unknown);
    unknown = "";
  };
  let i = 0;
  while (i < chunk.length) {
    let matched = "";
    const max = Math.min(8, chunk.length - i);
    for (let n = max; n >= 2; n -= 1) {
      const cand = chunk.slice(i, i + n);
      if (dict.has(cand) && !pieces.has(cand)) {
        matched = cand;
        break;
      }
    }
    if (matched) {
      flush();
      out.push(matched);
      i += matched.length;
      continue;
    }
    unknown += chunk[i];
    i += 1;
  }
  flush();
  if (out.length > 0) return out;
  return chunk.length <= MAX_HAN ? [chunk] : [];
}

function piecesOf(chunk: string, pieces: Set<string>): string[] {
  const words: string[] = [];
  for (const part of cutStops(chunk)) {
    if (part.length < 2) continue;
    if (part.length <= 4) {
      words.push(part);
      continue;
    }
    words.push(...segmentLong(part, pieces));
  }
  return words;
}

function blockedByGroup(word: string, pieces: Set<string>): boolean {
  if (pieces.has(word)) return true;
  for (const piece of pieces) {
    if (/^[\u4e00-\u9fff]{2,}$/.test(piece) && word.includes(piece)) return true;
  }
  return false;
}

function keepHan(word: string, pieces: Set<string>): boolean {
  if (!/^[\u4e00-\u9fff]{2,24}$/.test(word)) return false;
  if (STOP.has(word) || blockedByGroup(word, pieces)) return false;
  if (new Set(word).size === 1) return false;
  return true;
}

function latinWords(text: string): string[] {
  // 整段英文按词收下，大小写并成小写。不拆成字母碎片
  const words: string[] = [];
  for (const raw of text.match(/[A-Za-z][A-Za-z']{1,31}/g) ?? []) {
    const word = raw.replace(/'/g, "").toLowerCase();
    if (word.length >= 2 && word.length <= MAX_LATIN) words.push(word);
  }
  return words;
}

function keepLatin(word: string, pieces: Set<string>): boolean {
  if (EN_STOP.has(word) || pieces.has(word)) return false;
  if (new Set(word).size === 1) return false;
  return true;
}

function subsume(freq: Map<string, number>): Map<string, number> {
  // 短词如果只是某个更长词的一部分，而且次数没有高出一截，就当成碎片丢掉
  const drop = new Set<string>();
  const longer = [...freq.keys()].sort((a, b) => b.length - a.length);
  for (const long of longer) {
    if (drop.has(long)) continue;
    for (const [short, count] of freq) {
      if (short.length >= long.length || drop.has(short)) continue;
      const longCount = freq.get(long) ?? 0;
      if (long.includes(short) && count <= longCount * 1.25) drop.add(short);
    }
  }
  const kept = new Map<string, number>();
  for (const [word, count] of freq) {
    if (!drop.has(word)) kept.set(word, count);
  }
  return kept;
}

export function cleanWordCloudTexts(
  texts: string[],
  groupName: string,
  topN = 40,
  banNames: string[] = [],
): CloudWord[] {
  const names = [groupName, ...banNames].map((name) => name.trim()).filter(Boolean);
  const pieces = new Set<string>();
  for (const name of names) {
    for (const piece of groupPieces(name)) pieces.add(piece);
  }
  const freq = new Map<string, number>();
  const add = (word: string) => freq.set(word, (freq.get(word) ?? 0) + 1);
  for (const text of texts) {
    if (typeof text !== "string" || !text) continue;
    const stripped = stripNoise(text, pieces, names);
    for (const chunk of chunksOf(stripped)) {
      for (const part of splitTic(chunk)) {
        for (const word of piecesOf(part, pieces)) {
          if (keepHan(word, pieces)) add(word);
        }
      }
    }
    for (const word of latinWords(stripped)) {
      if (keepLatin(word, pieces)) add(word);
    }
  }
  const kept = subsume(freq);
  return [...kept.entries()]
    .sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0))
    .slice(0, Math.max(0, topN))
    .map(([word, count]) => ({ word, count }));
}
