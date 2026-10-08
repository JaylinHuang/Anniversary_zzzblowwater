/**
 * 把一句问话拆成几条群聊里可能出现的短词，并认出年份。
 * 模型只负责改写问句，不读归档。
 */
import { beijingClock } from "@/lib/date-key";
import { searchNeedles, topicNeedles } from "@/lib/fact-timeline";
import { chatCompletion, isLlmConfigured } from "@/lib/llm";

export type SearchPlan = {
  phrases: string[];
  /** 四位年份。没有就空 */
  year: string | null;
};

const PHRASE_STOP = new Set([
  "什么",
  "怎么",
  "哪里",
  "哪儿",
  "哪个",
  "多少",
  "是不是",
  "有没有",
  "觉得",
  "现在",
  "时候",
  "搜索",
  "关键词",
]);

const planCache = new Map<string, { at: number; plan: SearchPlan }>();

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

/** 问句里的年份。去年、前年按北京时间换算 */
export function yearFromTalk(talk: string, now = new Date()): string | null {
  const explicit = talk.match(/20\d{2}/);
  if (explicit) return explicit[0];
  const year = beijingClock(now).year;
  if (talk.includes("前年")) return String(year - 2);
  if (talk.includes("去年")) return String(year - 1);
  if (talk.includes("今年")) return String(year);
  return null;
}

/** 模型补的词必须和问句或已有检索词沾边，避免编出一个原文里没有的话题 */
export function keepGroundedPhrases(
  talk: string,
  local: string[],
  extra: string[],
): string[] {
  const compact = talk.replace(/\s+/g, "");
  return extra.filter((phrase) => {
    if (compact.includes(phrase) || local.includes(phrase)) return true;
    for (let i = 0; i < phrase.length - 1; i++) {
      const gram = phrase.slice(i, i + 2);
      if (compact.includes(gram)) return true;
      if (local.some((item) => item.includes(gram))) return true;
    }
    return false;
  });
}

/** 模型返回的几行短词。丢掉解释句和套话 */
export function parsePhraseLines(raw: string): string[] {
  const out: string[] = [];
  for (const part of raw.split(/[\n,，、;；]+/)) {
    const text = part.replace(/[^\u4e00-\u9fa5a-zA-Z0-9]/g, "").trim();
    if (/^20\d{2}$/.test(text)) continue;
    if (text.length < 2 || text.length > 6) continue;
    if (PHRASE_STOP.has(text)) continue;
    if (!out.includes(text)) out.push(text);
    if (out.length >= 3) break;
  }
  return out;
}

/** 不调用模型时的检索词。高中会带上高一、高二 */
export function planSearchLocal(
  talk: string,
  ignoreNames: string[] = [],
  now = new Date(),
): SearchPlan {
  const phrases = searchNeedles(topicNeedles(talk, ignoreNames)).slice(0, 6);
  return { phrases, year: yearFromTalk(talk, now) };
}

/**
 * 事实问题先改写成最多三条短词，再去翻群聊。
 * 模型失败或没配置时，退回问句里已经有的词。
 */
export async function expandSearchPlan(
  talk: string,
  ignoreNames: string[] = [],
  now = new Date(),
): Promise<SearchPlan> {
  const local = planSearchLocal(talk, ignoreNames, now);
  const key = `${talk.slice(0, 200)}\n${ignoreNames.join(",")}`;
  const hit = planCache.get(key);
  if (hit && Date.now() - hit.at < 10 * 60 * 1000) return hit.plan;
  if (!isLlmConfigured() || talk.trim().length < 2) {
    planCache.set(key, { at: Date.now(), plan: local });
    return local;
  }
  let plan = local;
  try {
    const raw = await chatCompletion(
      [
        {
          role: "system",
          content: [
            "把群友的问题改写成最多 3 个搜索词，每行一个。",
            "只要群聊原文里可能出现的短词，2 到 6 个字，例如高中写成高二、高中生。",
            "不要解释，不要整句，不要编问题里没问到的事。",
          ].join("\n"),
        },
        { role: "user", content: talk.slice(0, 200) },
      ],
      { temperature: 0.2, maxTokens: 80 },
    );
    const extra = keepGroundedPhrases(talk, local.phrases, parsePhraseLines(raw));
    plan = {
      phrases: unique([...local.phrases, ...extra]).slice(0, 6),
      year: local.year,
    };
  } catch {
    plan = local;
  }
  planCache.set(key, { at: Date.now(), plan });
  return plan;
}
