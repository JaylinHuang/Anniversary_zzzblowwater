import type { ParsedMessage } from "@/lib/chat-parser";
import { parseQceXlsx, normalizeExportTime } from "@/lib/chat-xlsx";

/** 网站导入只认这一份结构，xlsx 与 QQChatExporter 都先转成它 */
export const ARCHIVE_FORMAT = "zzz-archive" as const;
export const ARCHIVE_VERSION = 1;

export type ArchiveDocument = {
  format: typeof ARCHIVE_FORMAT;
  version: typeof ARCHIVE_VERSION;
  groupName: string;
  groupId: string;
  source: string;
  sourceFile: string;
  messages: ParsedMessage[];
};

const KEEP_EXPORTER_TYPES = new Set(["text", "reply"]);

type ExporterContent = {
  text?: unknown;
  elements?: { type?: string; data?: { text?: unknown } }[];
};

type ExporterMessage = {
  time?: unknown;
  recalled?: boolean;
  system?: boolean;
  type?: string;
  sender?: { uin?: string; name?: string; groupCard?: string };
  content?: ExporterContent | string;
};

function cellStr(v: unknown): string {
  if (v == null) return "";
  return String(v).trim();
}

/** 导出器里正文可能在 text，也可能拆在 elements 里 */
function extractExporterText(content: ExporterMessage["content"]): string {
  if (typeof content === "string") return content.trim();
  if (!content || typeof content !== "object") return "";
  const direct = cellStr(content.text);
  if (direct) return direct;
  const parts = Array.isArray(content.elements) ? content.elements : [];
  return parts
    .map((el) =>
      el?.type === "text" ? cellStr(el.data?.text) : "",
    )
    .join("")
    .trim();
}

function exporterSender(sender: ExporterMessage["sender"]): {
  sender: string;
  qq: string | null;
} {
  const card = cellStr(sender?.groupCard);
  const name = cellStr(sender?.name);
  const uin = cellStr(sender?.uin).replace(/\D/g, "");
  const qq = /^\d{5,12}$/.test(uin) ? uin : null;
  // 群名片优先；名片本身就是 QQ 号时改用昵称
  let display = card;
  if (!display || (qq && display === qq)) display = name;
  if (!display || (qq && display === qq)) display = card || name || qq || "未知";
  return { sender: display, qq };
}

export type ExporterConvertResult = {
  doc: ArchiveDocument;
  notes: string[];
};

/**
 * QQChatExporter 原始 JSON → 站点归档 JSON
 * 只保留文本/回复，跳过撤回、系统消息和空正文
 */
export function archiveFromQceExporter(
  raw: string,
  meta: { sourceFile: string },
): ExporterConvertResult {
  let data: unknown;
  try {
    data = JSON.parse(raw.replace(/^\uFEFF/, ""));
  } catch {
    throw new Error("QQChatExporter JSON 无法解析");
  }
  if (!data || typeof data !== "object") {
    throw new Error("QQChatExporter JSON 根节点必须是对象");
  }
  const root = data as {
    chatInfo?: { name?: string; peerUid?: string };
    messages?: unknown;
  };
  if (!Array.isArray(root.messages)) {
    throw new Error("QQChatExporter JSON 缺少 messages 数组");
  }

  const messages: ParsedMessage[] = [];
  let recalled = 0;
  let nonText = 0;
  let empty = 0;

  for (const item of root.messages) {
    if (!item || typeof item !== "object") {
      nonText++;
      continue;
    }
    const msg = item as ExporterMessage;
    if (msg.recalled) {
      recalled++;
      continue;
    }
    const type = cellStr(msg.type).toLowerCase();
    if (msg.system || (type && !KEEP_EXPORTER_TYPES.has(type))) {
      nonText++;
      continue;
    }
    const content = extractExporterText(msg.content);
    if (!content) {
      empty++;
      continue;
    }
    const who = exporterSender(msg.sender);
    messages.push({
      sender: who.sender,
      qq: who.qq,
      sentAt: normalizeExportTime(msg.time),
      content,
    });
  }

  const notes: string[] = [];
  if (recalled) notes.push(`已跳过撤回 ${recalled} 条`);
  if (nonText) notes.push(`已跳过非文本 ${nonText} 条`);
  if (empty) notes.push(`已跳过空正文 ${empty} 条`);
  if (!messages.length) notes.push("未解析到可导入的文本消息");

  return {
    doc: {
      format: ARCHIVE_FORMAT,
      version: ARCHIVE_VERSION,
      groupName: cellStr(root.chatInfo?.name),
      groupId: cellStr(root.chatInfo?.peerUid),
      source: "qq-chat-exporter",
      sourceFile: meta.sourceFile,
      messages,
    },
    notes,
  };
}

/** QCE xlsx → 同一份归档 JSON */
export function archiveFromXlsx(
  buffer: Buffer,
  meta: { groupName: string; groupId: string; sourceFile: string },
): ExporterConvertResult {
  const { messages, errors } = parseQceXlsx(buffer);
  return {
    doc: {
      format: ARCHIVE_FORMAT,
      version: ARCHIVE_VERSION,
      groupName: meta.groupName,
      groupId: meta.groupId,
      source: "qce-xlsx",
      sourceFile: meta.sourceFile,
      messages,
    },
    notes: errors,
  };
}

function asQq(v: unknown): string | null {
  if (v == null || v === "") return null;
  const digits = String(v).replace(/\D/g, "");
  return /^\d{5,12}$/.test(digits) ? digits : null;
}

/**
 * 解析站点导入用的 zzz-archive JSON
 * 结构不对时直接抛错，避免把原始导出误入库
 */
export function parseArchiveJson(raw: string): {
  messages: ParsedMessage[];
  errors: string[];
} {
  let data: unknown;
  try {
    data = JSON.parse(raw.replace(/^\uFEFF/, ""));
  } catch {
    throw new Error("JSON 无法解析");
  }
  if (!data || typeof data !== "object" || Array.isArray(data)) {
    throw new Error("JSON 根节点必须是对象");
  }
  const obj = data as Record<string, unknown>;
  const meta = obj.metadata;
  if (
    meta &&
    typeof meta === "object" &&
    (meta as { name?: string }).name === "QQChatExporter"
  ) {
    throw new Error(
      "这是 QQChatExporter 原始导出，请先转成 zzz-archive JSON 再导入",
    );
  }
  if (obj.format !== ARCHIVE_FORMAT || obj.version !== ARCHIVE_VERSION) {
    throw new Error("仅支持 format 为 zzz-archive、version 为 1 的 JSON");
  }
  if (!Array.isArray(obj.messages)) {
    throw new Error("缺少 messages 数组");
  }

  const messages: ParsedMessage[] = [];
  const errors: string[] = [];
  let blank = 0;
  for (const item of obj.messages) {
    if (!item || typeof item !== "object") {
      blank++;
      continue;
    }
    const row = item as Record<string, unknown>;
    const content = cellStr(row.content);
    if (!content) {
      blank++;
      continue;
    }
    const sentAt = cellStr(row.sentAt);
    messages.push({
      sender: cellStr(row.sender) || "未知",
      qq: asQq(row.qq),
      sentAt: sentAt || null,
      content,
    });
  }
  if (blank) errors.push(`已跳过空正文 ${blank} 条`);
  if (!messages.length) errors.push("没有可导入的消息");
  return { messages, errors };
}
