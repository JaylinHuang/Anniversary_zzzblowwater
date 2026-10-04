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
  const t = raw
    .replace(/\[图片:[^\]]*\]/gi, "")
    .replace(/\[image:[^\]]*\]/gi, "")
    .replace(/\[(图片|语音|视频|文件|表情|动画表情|分享)[^\]]*\]/gi, "")
    .trim();
  if (!t) return false;
  if (/^\[(图片|语音|视频|文件|表情|动画表情|分享).*\]$/i.test(raw)) return false;
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
