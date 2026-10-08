import { isAgentCorpusText } from "@/lib/chat-parser";
import { recentMessagesByQq } from "@/lib/group-recall";

/** 从本人发言里量出来的说话节奏，用来约束分身别写成客服长文 */
export type SpeakStyle = {
  avgLen: number;
  shortPct: number;
  longPct: number;
  emojiPct: number;
  questionPct: number;
  sample: number;
};

const EMOJI =
  /[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\u{FE00}-\u{FE0F}]/u;

const cache = new Map<string, { at: number; style: SpeakStyle | null }>();

/** 纯统计，不调用模型。样本太少时返回 null */
export function summarizeSpeakStyle(lines: string[]): SpeakStyle | null {
  const texts = lines.map((line) => line.trim()).filter((line) => line.length > 0);
  if (texts.length < 8) return null;
  const lens = texts.map((text) => [...text].length);
  const total = lens.reduce((sum, n) => sum + n, 0);
  const n = texts.length;
  return {
    avgLen: Math.round(total / n),
    shortPct: Math.round((100 * lens.filter((len) => len < 10).length) / n),
    longPct: Math.round((100 * lens.filter((len) => len > 50).length) / n),
    emojiPct: Math.round((100 * texts.filter((text) => EMOJI.test(text)).length) / n),
    questionPct: Math.round((100 * texts.filter((text) => /[?？]/.test(text)).length) / n),
    sample: n,
  };
}

/** 写进人设提示词的节奏约束 */
export function formatSpeakStyle(style: SpeakStyle): string {
  const short =
    style.avgLen <= 18
      ? "默认一两句就停，但这一两句要回答对方刚问的事，不要甩一句不相干的群记录。"
      : "可以稍长，但不要超过这个人平时的篇幅。";
  return [
    "【说话节奏】下面是这个人自己发言的统计，回复时对齐，不要写成客服。",
    `平均大约 ${style.avgLen} 个字。`,
    `不到 10 个字的短句约占 ${style.shortPct}%。`,
    `超过 50 个字的长段约占 ${style.longPct}%。`,
    `带表情的约占 ${style.emojiPct}%，没有这个习惯就不要堆表情。`,
    `带问号的约占 ${style.questionPct}%，不要习惯性反问。`,
    short,
  ].join("\n");
}

/** 聊天窗口标题下的一行摘要 */
export function speakStyleCaption(style: SpeakStyle): string {
  return `平均 ${style.avgLen} 字 · 短句 ${style.shortPct}% · 表情 ${style.emojiPct}%`;
}

/** 最近一段本人发言的节奏。只取最近几段，不把这个人的全部发言排序 */
export async function loadSpeakStyle(qq: string): Promise<SpeakStyle | null> {
  const hit = cache.get(qq);
  if (hit && Date.now() - hit.at < 10 * 60 * 1000) return hit.style;
  const rows = await recentMessagesByQq(qq, 80);
  const style = summarizeSpeakStyle(
    rows.map((row) => row.content).filter(isAgentCorpusText),
  );
  cache.set(qq, { at: Date.now(), style });
  return style;
}
