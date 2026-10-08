/** 日期键与稳定哈希（无 IO）。日历日和展示时间一律按北京时间，不跟服务器时区走。 */

export const BEIJING_TZ = "Asia/Shanghai";

export type BeijingClock = {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
};

const pad2 = (n: number) => String(n).padStart(2, "0");

/** 某个时刻的北京时间。hour 为 0–23 */
export function beijingClock(now: Date): BeijingClock {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: BEIJING_TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(now);
  const num = (type: string) =>
    Number(parts.find((part) => part.type === type)?.value ?? "0");
  let hour = num("hour");
  if (hour === 24) hour = 0;
  return {
    year: num("year"),
    month: num("month"),
    day: num("day"),
    hour,
    minute: num("minute"),
  };
}

/** 北京时间的年月日时。每天 04:00 跟进导入时用 */
export function shanghaiClock(now: Date): {
  year: number;
  month: number;
  day: number;
  hour: number;
} {
  const clock = beijingClock(now);
  return { year: clock.year, month: clock.month, day: clock.day, hour: clock.hour };
}

export function shanghaiDayKey(now: Date): string {
  const clock = beijingClock(now);
  return `${clock.year}-${pad2(clock.month)}-${pad2(clock.day)}`;
}

export function todayKey(d = new Date()): string {
  return shanghaiDayKey(d);
}

/**
 * 库里的 UTC「YYYY-MM-DD HH:MM:SS」，或带 Z 的 ISO。
 * 没有时区标记的按 UTC 理解，显示成北京时间。
 */
export function parseUtcLike(raw: string): Date | null {
  const text = raw.trim();
  if (!text) return null;
  const hasZone = /(?:[zZ]|[+-]\d{2}:?\d{2})$/.test(text);
  const iso = hasZone ? text : `${text.includes("T") ? text : text.replace(" ", "T")}Z`;
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? null : d;
}

/** 显示成北京时间 YYYY-MM-DD HH:mm。认不出就原样截一段 */
export function formatBeijingDateTime(raw: string): string {
  const text = String(raw || "").trim();
  if (!text) return "";
  const d = parseUtcLike(text);
  if (!d) return text.slice(0, 16);
  const clock = beijingClock(d);
  return `${clock.year}-${pad2(clock.month)}-${pad2(clock.day)} ${pad2(clock.hour)}:${pad2(clock.minute)}`;
}

export function formatBeijingDate(raw: string): string {
  const full = formatBeijingDateTime(raw);
  return full.slice(0, 10);
}

/** 私聊气泡上的时间：北京时间的今天只显示 HH:mm */
export function formatBeijingClock(raw: string, now = new Date()): string {
  const d = parseUtcLike(raw);
  if (!d) return "";
  const clock = beijingClock(d);
  const today = beijingClock(now);
  const hm = `${pad2(clock.hour)}:${pad2(clock.minute)}`;
  const sameDay =
    clock.year === today.year &&
    clock.month === today.month &&
    clock.day === today.day;
  if (sameDay) return hm;
  return `${clock.month}月${clock.day}日 ${hm}`;
}

/** 按日期稳定哈希，同一天全站看到同一句 */
export function daySeed(dateKey: string): number {
  let h = 2166136261;
  for (let i = 0; i < dateKey.length; i++) {
    h ^= dateKey.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

export function pickIndex(seed: number, length: number): number {
  if (length <= 0) return -1;
  return seed % length;
}

/** 星期索引：0=周日 … 6=周六。按公历日本身算，不跟服务器时区走 */
export function weekdayIndex(dateKey: string): number {
  const [y, m, d] = dateKey.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay();
}
