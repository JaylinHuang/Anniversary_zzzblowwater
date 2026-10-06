import { contentMentionsBot } from "@/lib/bot-chat";

export type ParsedMessage = {
  sender: string;
  qq: string | null;
  sentAt: string | null;
  content: string;
};

/**
 * 支持常见 QQ 导出 TXT：
 * 2025-07-10 21:05:33 昵称(123456)
 * 消息内容
 */
export function parseQqTxt(raw: string): {
  messages: ParsedMessage[];
  errors: string[];
} {
  const lines = raw.replace(/\r\n/g, "\n").split("\n");
  const header =
    /^(\d{4}[-/]\d{1,2}[-/]\d{1,2}\s+\d{1,2}:\d{2}(?::\d{2})?)\s+(.+)$/;
  const messages: ParsedMessage[] = [];
  const errors: string[] = [];
  let i = 0;
  while (i < lines.length) {
    const line = lines[i].trimEnd();
    if (!line.trim()) {
      i++;
      continue;
    }
    const m = line.match(header);
    if (!m) {
      if (messages.length === 0) {
        i++;
        continue;
      }
      errors.push(`第 ${i + 1} 行无法识别为消息头`);
      i++;
      continue;
    }
    const sentAt = m[1].replace(/\//g, "-");
    const rawSender = m[2].trim();
    const qqMatch = rawSender.match(/\((\d{5,})\)$/);
    const qq = qqMatch ? qqMatch[1] : null;
    const sender = rawSender.replace(/\(\d+\)$/, "").trim();
    i++;
    const body: string[] = [];
    while (i < lines.length) {
      const next = lines[i];
      if (!next.trim()) {
        i++;
        break;
      }
      if (header.test(next.trimEnd())) break;
      body.push(next);
      i++;
    }
    const content = body.join("\n").trim();
    if (!content) continue;
    // 纯媒体占位可保留，但名册计票侧会再过滤
    messages.push({ sender, qq, sentAt, content });
  }
  return { messages, errors };
}

export function isCountableTextMessage(content: string): boolean {
  const raw = content.trim();
  if (!raw) return false;
  // 去掉 QCE / QQ 导出的媒体占位后再判断是否还有有效文字
  const t = stripMediaPlaceholders(raw);
  if (!t) return false;
  if (/^\[(图片|语音|视频|文件|表情|动画表情|分享).*\]$/i.test(raw)) return false;
  return true;
}

/** 整句都是附和、笑声或系统提示时，不送进人设和检索 */
const LOW_INFO_EXACT = new Set([
  "嗯",
  "嗯嗯",
  "哦",
  "哦哦",
  "啊",
  "啊啊",
  "额",
  "呃",
  "喔",
  "噢",
  "嘿",
  "呵",
  "嘻",
  "好",
  "好的",
  "好吧",
  "好哒",
  "行",
  "行吧",
  "可以",
  "对",
  "对的",
  "是",
  "是的",
  "收到",
  "了解",
  "明白",
  "知道了",
  "ok",
  "okay",
  "6",
  "66",
  "666",
  "6666",
  "草",
  "笑死",
  "笑死了",
  "+1",
  "加一",
  "同上",
  "顶",
  "赞",
  "1",
]);

function stripMediaPlaceholders(raw: string) {
  return raw
    .replace(/\[图片:[^\]]*\]/gi, "")
    .replace(/\[image:[^\]]*\]/gi, "")
    .replace(/\[(图片|语音|视频|文件|表情|动画表情|分享)[^\]]*\]/gi, "")
    .trim();
}

/** 去掉链接、@ 和空白，留下用来判断是否值得学习的正文 */
function stripAgentInputDecor(raw: string) {
  return stripMediaPlaceholders(raw)
    .replace(/https?:\/\/\S+/gi, "")
    .replace(/www\.\S+/gi, "")
    .replace(/@\S+/g, "")
    .replace(/\s+/g, "")
    .trim();
}

/**
 * 人设归纳和向量检索的输入过滤。
 * 归档原文不删；只判断这句话能不能代表说话方式。
 */
export function isAgentCorpusText(content: string): boolean {
  if (contentMentionsBot(content)) return false;
  if (!isCountableTextMessage(content)) return false;
  const compact = stripAgentInputDecor(content);
  if (compact.length < 2) return false;
  if (/^(.)\1+$/u.test(compact)) return false;
  const withoutMarks = compact.replace(
    /[\p{P}\p{S}\p{Extended_Pictographic}]/gu,
    "",
  );
  if (withoutMarks.length < 2) return false;
  const key = withoutMarks.toLowerCase();
  if (LOW_INFO_EXACT.has(key)) return false;
  // 整句只剩笑声或数字附和
  if (/^(哈+|h+|6+|w+|草+)+$/i.test(key)) return false;
  if (
    /^(你)?撤回了一条消息$|加入了(本)?群(聊)?$|拍了拍|邀请.+加入(了)?(本)?群/.test(
      withoutMarks,
    )
  ) {
    return false;
  }
  return true;
}

export function previewStats(messages: ParsedMessage[]) {
  const times = messages
    .map((m) => m.sentAt)
    .filter((t): t is string => !!t)
    .sort();
  return {
    count: messages.length,
    timeStart: times[0] ?? null,
    timeEnd: times[times.length - 1] ?? null,
    sample: messages.slice(0, 5),
    withQq: messages.filter((m) => m.qq).length,
  };
}
