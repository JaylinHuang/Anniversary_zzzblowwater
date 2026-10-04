import * as XLSX from "xlsx";
import type { ParsedMessage } from "@/lib/chat-parser";

/** QCE / 常见导出表头别名 */
const COL = {
  time: ["时间", "发送时间", "date", "time", "datetime"],
  sender: ["发送者", "昵称", "群名片", "name", "sender"],
  qq: ["发送者qq号", "qq号", "qq", "账号", "uin", "senderuin"],
  type: ["消息类型", "类型", "msgtype", "type"],
  content: ["消息内容", "内容", "消息", "content", "text"],
  withdrawn: ["是否撤回", "撤回", "withdrawn"],
};

const KEEP_TYPES = new Set(["文本", "回复", "text", "reply"]);

function normKey(k: string) {
  return k.trim().toLowerCase().replace(/\s+/g, "");
}

function pick(
  row: Record<string, unknown>,
  aliases: string[],
): unknown {
  const map = new Map<string, unknown>();
  for (const [k, v] of Object.entries(row)) {
    map.set(normKey(k), v);
  }
  for (const a of aliases) {
    if (map.has(normKey(a))) return map.get(normKey(a));
  }
  return undefined;
}

/** Excel 序列日或 ISO / 字符串 → Asia/Shanghai 可读时间 */
export function normalizeExportTime(raw: unknown): string | null {
  if (raw == null || raw === "") return null;
  let d: Date | null = null;
  if (raw instanceof Date) {
    d = raw;
  } else if (typeof raw === "number" && Number.isFinite(raw)) {
    // Excel 序列（以 1899-12-30 为原点，UTC 天）
    const utc = Date.UTC(1899, 11, 30) + raw * 86400000;
    d = new Date(utc);
  } else {
    const s = String(raw).trim();
    const parsed = new Date(s);
    if (!Number.isNaN(parsed.getTime())) d = parsed;
  }
  if (!d || Number.isNaN(d.getTime())) {
    const s = String(raw).trim();
    return s || null;
  }
  return d
    .toLocaleString("sv-SE", { timeZone: "Asia/Shanghai" })
    .replace("T", " ");
}

function cellStr(v: unknown): string {
  if (v == null) return "";
  return String(v).trim();
}

/**
 * 解析 QQ Chat Exporter（及相近列名）xlsx Buffer
 * 默认只保留「文本/回复」，跳过撤回与系统消息
 */
export function parseQceXlsx(
  buffer: ArrayBuffer | Buffer,
  options?: { sheetName?: string },
): { messages: ParsedMessage[]; errors: string[]; sheet: string } {
  const wb = XLSX.read(buffer, {
    type: "buffer",
    cellDates: true,
  });
  const sheetName =
    options?.sheetName ||
    wb.SheetNames.find((n) => /聊天|消息|record/i.test(n)) ||
    wb.SheetNames[0];
  if (!sheetName) {
    return { messages: [], errors: ["工作簿中没有工作表"], sheet: "" };
  }
  const sheet = wb.Sheets[sheetName];
  const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, {
    defval: "",
    raw: false,
  });

  const messages: ParsedMessage[] = [];
  const errors: string[] = [];
  let skippedType = 0;
  let skippedWithdrawn = 0;

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const type = cellStr(pick(row, COL.type));
    const typeKey = type.toLowerCase();
    if (type && !KEEP_TYPES.has(type) && !KEEP_TYPES.has(typeKey)) {
      skippedType++;
      continue;
    }
    const withdrawn = cellStr(pick(row, COL.withdrawn));
    if (withdrawn === "是" || withdrawn.toLowerCase() === "yes" || withdrawn === "1") {
      skippedWithdrawn++;
      continue;
    }
    const content = cellStr(pick(row, COL.content));
    if (!content) continue;
    const sender = cellStr(pick(row, COL.sender)) || "未知";
    const qqRaw = cellStr(pick(row, COL.qq)).replace(/\D/g, "");
    const qq = /^\d{5,12}$/.test(qqRaw) ? qqRaw : null;
    const sentAt = normalizeExportTime(pick(row, COL.time));
    messages.push({ sender, qq, sentAt, content });
  }

  if (!messages.length) {
    errors.push("未解析到可导入消息（请确认含「聊天记录」表，且有文本/回复行）");
  } else {
    if (skippedType) {
      errors.push(`已跳过非文本类型 ${skippedType} 条（系统消息/媒体等）`);
    }
    if (skippedWithdrawn) {
      errors.push(`已跳过撤回消息 ${skippedWithdrawn} 条`);
    }
  }

  return { messages, errors, sheet: sheetName };
}
