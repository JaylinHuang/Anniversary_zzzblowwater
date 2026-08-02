/** 对聊天内容做基础脱敏 */
export function desensitize(text: string): string {
  return text
    .replace(/1[3-9]\d{9}/g, "[手机号]")
    .replace(/\b\d{17}[\dXx]\b/g, "[证件号]")
    .replace(/https?:\/\/\S+/gi, "[链接]")
    .replace(/\b\d{6,}\b/g, (m) => (m.length >= 8 ? "[数字串]" : m));
}
