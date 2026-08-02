/** OneBot 载荷解析（无 IO，便于单测） */

export type OneBotIncoming = {
  post_type?: string;
  message_type?: string;
  notice_type?: string;
  group_id?: number | string;
  user_id?: number | string;
  message_id?: number | string;
  time?: number;
  raw_message?: string;
  message?: string | Array<{ type: string; data?: Record<string, unknown> }>;
  sender?: {
    nickname?: string;
    card?: string;
  };
};

/** 从 OneBot 消息段提取纯文本 */
export function extractPlainText(payload: OneBotIncoming): string {
  if (typeof payload.raw_message === "string" && payload.raw_message.trim()) {
    return payload.raw_message;
  }
  if (typeof payload.message === "string") return payload.message;
  if (Array.isArray(payload.message)) {
    return payload.message
      .map((seg) => {
        if (seg.type === "text") return String(seg.data?.text ?? "");
        if (seg.type === "at") return `@${seg.data?.qq ?? ""}`;
        if (seg.type === "face") return "[表情]";
        if (seg.type === "image") return "[图片]";
        if (seg.type === "record") return "[语音]";
        if (seg.type === "video") return "[视频]";
        if (seg.type === "file") return "[文件]";
        if (seg.type === "reply") return "[回复]";
        return `[${seg.type}]`;
      })
      .join("");
  }
  return "";
}

export function formatSender(payload: OneBotIncoming): string {
  const card = payload.sender?.card?.trim();
  const nick = payload.sender?.nickname?.trim();
  return card || nick || `QQ${payload.user_id ?? "未知"}`;
}

export function formatSentAt(unixSec?: number): string {
  const d = unixSec ? new Date(unixSec * 1000) : new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

/** 是否应接收该群消息 */
export function shouldAcceptGroup(
  payloadGroupId: string | number | undefined,
  configuredGroupId: string | null,
): boolean {
  if (!configuredGroupId) return true;
  if (payloadGroupId == null) return false;
  return String(payloadGroupId) === configuredGroupId;
}
