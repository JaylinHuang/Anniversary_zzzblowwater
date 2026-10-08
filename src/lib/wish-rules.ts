/** 祝福墙纯函数（无 IO，便于复用与测试） */

import { todayKey } from "@/lib/date-key";

/** 把 Date 格式化为 SQLite datetime('now') 同款的 UTC 字符串：YYYY-MM-DD HH:MM:SS */
export function toSqliteUtc(d: Date): string {
  const p = (n: number) => String(n).padStart(2, "0");
  return (
    `${d.getUTCFullYear()}-${p(d.getUTCMonth() + 1)}-${p(d.getUTCDate())} ` +
    `${p(d.getUTCHours())}:${p(d.getUTCMinutes())}:${p(d.getUTCSeconds())}`
  );
}

/**
 * 「今天」的半开区间 [start, end)，以北京时间 0 点为界，
 * 返回值已换算成库内 created_at（UTC）可直接比较的字符串。
 * 用区间比较而不是 date(created_at)，避免 UTC 与北京日期错位导致跨日误算。
 */
export function localDayRangeUtc(now = new Date()): {
  start: string;
  end: string;
} {
  const key = todayKey(now);
  const start = new Date(`${key}T00:00:00+08:00`);
  const end = new Date(start.getTime() + 24 * 60 * 60 * 1000);
  return { start: toSqliteUtc(start), end: toSqliteUtc(end) };
}

/** 今日还能贴几条：永不小于 0 */
export function wishRemaining(limit: number, used: number): number {
  return Math.max(0, limit - used);
}

/**
 * 条件插入：只有当该用户今日已贴条数 < 上限时才会插入。
 * 条数检查与写入合在同一条 SQL 里，没有「先查后写」的空档。
 * 参数顺序：user_id, content, user_id, start, end, limit
 */
export const INSERT_WISH_IF_UNDER_LIMIT_SQL = `
  INSERT INTO wishes (user_id, content)
  SELECT ?, ?
  WHERE (
    SELECT COUNT(*) FROM wishes
    WHERE user_id = ? AND created_at >= ? AND created_at < ?
  ) < ?
`;

/** 统计某人今天已贴条数的 SQL，参数顺序：user_id, start, end */
export const COUNT_WISHES_TODAY_SQL = `
  SELECT COUNT(*) as c FROM wishes
  WHERE user_id = ? AND created_at >= ? AND created_at < ?
`;
