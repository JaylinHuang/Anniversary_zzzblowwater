/**
 * 群里的 QQ 机器人，按群名片识别。
 * 伊雷娜 / 伊蕾娜都收进来：库里的群名片是「伊蕾娜」。
 */
export const BOT_GROUP_NAMES = ["伊蕾娜", "伊雷娜", "诺艾尔", "汐雨", "小呱呱"] as const;

export function isBotGroupName(name: string): boolean {
  const text = name.trim();
  if (!text) return false;
  return BOT_GROUP_NAMES.some((bot) => text === bot || text.includes(bot));
}

/** 正文里点到机器人群名片，就算跟机器人说话，不拿去学口气 */
export function contentMentionsBot(content: string): boolean {
  return BOT_GROUP_NAMES.some((bot) => content.includes(bot));
}

/** 机器人自己发的、同一个 QQ 发的、以及正文里点到这些群名片的，都算跟机器人对话 */
export function isBotChat(
  message: { sender: string; qq?: string | null; content: string },
  botQqs: ReadonlySet<string>,
): boolean {
  if (isBotGroupName(message.sender)) return true;
  const qq = String(message.qq ?? "").replace(/\D/g, "");
  if (qq.length >= 5 && botQqs.has(qq)) return true;
  return BOT_GROUP_NAMES.some((bot) => message.content.includes(bot));
}
