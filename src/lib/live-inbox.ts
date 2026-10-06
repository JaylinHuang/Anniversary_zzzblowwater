import { desensitize } from "@/lib/desensitize";
import {
  ARCHIVE_FORMAT,
  ARCHIVE_VERSION,
  parseArchiveJson,
} from "@/lib/chat-json";
import {
  extractPlainText,
  formatSender,
  shouldAcceptGroup,
  type OneBotIncoming,
} from "@/lib/onebot-parse";

/** 每天把积压消息灌进归档的钟点，按北京时间 */
export const DAILY_FLUSH_HOUR = 4;

export type InboxPayload = {
  sourceMsgId: string | null;
  sender: string;
  qq: string | null;
  sentAt: string | null;
  content: string;
};

/** 北京时间的年月日时，hour 为 0–23 */
export function shanghaiClock(now: Date): {
  year: number;
  month: number;
  day: number;
  hour: number;
} {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Shanghai",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    hourCycle: "h23",
  }).formatToParts(now);
  const num = (type: string) =>
    Number(parts.find((part) => part.type === type)?.value ?? "0");
  let hour = num("hour");
  if (hour === 24) hour = 0;
  return { year: num("year"), month: num("month"), day: num("day"), hour };
}

export function shanghaiSentAt(unixSec?: number): string {
  const clock = shanghaiClock(unixSec ? new Date(unixSec * 1000) : new Date());
  const pad = (n: number) => String(n).padStart(2, "0");
  const when = unixSec ? new Date(unixSec * 1000) : new Date();
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Shanghai",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  }).formatToParts(when);
  const num = (type: string) =>
    Number(parts.find((part) => part.type === type)?.value ?? "0");
  return `${clock.year}-${pad(clock.month)}-${pad(clock.day)} ${pad(clock.hour)}:${pad(num("minute"))}:${pad(num("second"))}`;
}

export function shanghaiDayKey(now: Date): string {
  const clock = shanghaiClock(now);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${clock.year}-${pad(clock.month)}-${pad(clock.day)}`;
}

/**
 * 是否到了该灌库的时候。
 * 北京时间 4 点之前不跑；当天已经灌过也不再跑。
 * 服务若错过 4 点，当天稍后启动时补跑一次。
 */
export function flushIsDue(
  now: Date,
  lastFlushIso: string | null,
  hour = DAILY_FLUSH_HOUR,
): boolean {
  const clock = shanghaiClock(now);
  if (clock.hour < hour) return false;
  if (!lastFlushIso) return true;
  const last = new Date(lastFlushIso);
  if (Number.isNaN(last.getTime())) return true;
  return shanghaiDayKey(last) !== shanghaiDayKey(now);
}

/**
 * 把一条 OneBot 群消息洗成 JSON 字符串。
 * 正文走现有脱敏；空消息、别的群、非群消息返回 null。
 */
export function cleanOneBotToJson(
  payload: OneBotIncoming,
  configuredGroupId: string | null,
): { json: string; payload: InboxPayload } | { skip: string } {
  if (payload.post_type !== "message" || payload.message_type !== "group") {
    return { skip: "not_group_message" };
  }
  if (!shouldAcceptGroup(payload.group_id, configuredGroupId)) {
    return { skip: "group_mismatch" };
  }
  const raw = extractPlainText(payload).trim();
  if (!raw) return { skip: "empty" };
  const content = desensitize(raw).trim();
  if (!content) return { skip: "empty" };
  const qqRaw =
    payload.user_id != null ? String(payload.user_id).replace(/\D/g, "") : "";
  const record: InboxPayload = {
    sourceMsgId:
      payload.message_id != null && String(payload.message_id).trim()
        ? String(payload.message_id)
        : null,
    sender: formatSender(payload),
    qq: /^\d{5,12}$/.test(qqRaw) ? qqRaw : null,
    sentAt: shanghaiSentAt(payload.time),
    content,
  };
  return { json: JSON.stringify(record), payload: record };
}

export function parseInboxJson(raw: string): InboxPayload | null {
  let data: unknown;
  try {
    data = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!data || typeof data !== "object") return null;
  const row = data as Record<string, unknown>;
  const content = typeof row.content === "string" ? row.content.trim() : "";
  if (!content) return null;
  const sender = typeof row.sender === "string" ? row.sender.trim() : "";
  const qq = typeof row.qq === "string" && /^\d{5,12}$/.test(row.qq) ? row.qq : null;
  const sentAt =
    typeof row.sentAt === "string" && row.sentAt.trim() ? row.sentAt.trim() : null;
  const sourceMsgId =
    row.sourceMsgId == null || String(row.sourceMsgId).trim() === ""
      ? null
      : String(row.sourceMsgId);
  return {
    sourceMsgId,
    sender: sender || "未知",
    qq,
    sentAt,
    content,
  };
}

/**
 * 积压的 JSON 收成站点认的 zzz-archive 字符串。
 * 再走 parseArchiveJson，保证和手动导入同一条清洗门。
 */
export function archiveJsonFromInbox(
  payloads: InboxPayload[],
  meta: { groupName: string; groupId: string; sourceFile: string },
): string {
  return JSON.stringify({
    format: ARCHIVE_FORMAT,
    version: ARCHIVE_VERSION,
    groupName: meta.groupName,
    groupId: meta.groupId,
    source: "onebot-daily",
    sourceFile: meta.sourceFile,
    messages: payloads.map((row) => ({
      sender: row.sender,
      qq: row.qq,
      sentAt: row.sentAt,
      content: row.content,
    })),
  });
}

export function messagesFromInboxArchive(raw: string): InboxPayload[] {
  const parsed = parseArchiveJson(raw);
  return parsed.messages.map((row) => ({
    sourceMsgId: null,
    sender: row.sender,
    qq: row.qq,
    sentAt: row.sentAt,
    content: row.content,
  }));
}
