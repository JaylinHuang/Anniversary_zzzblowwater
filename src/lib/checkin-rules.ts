import { todayKey } from "./date-key";

const STAMPS = [
  "绳网签到",
  "空洞打卡",
  "电波回应",
  "邦布盖章",
  "霓虹足迹",
  "夜航印记",
  "吹水一戳",
] as const;

export function stampForDate(dateKey: string): string {
  let h = 0;
  for (let i = 0; i < dateKey.length; i++) {
    h = (h + dateKey.charCodeAt(i) * (i + 3)) % 997;
  }
  return STAMPS[h % STAMPS.length];
}

function previousDay(dateKey: string): string {
  const [y, m, d] = dateKey.split("-").map(Number);
  const dt = new Date(y, m - 1, d);
  dt.setDate(dt.getDate() - 1);
  return todayKey(dt);
}

/**
 * 最近 N 天（含今天）逐日盖章情况，按日期从早到晚排列。
 * 只有 dates 里真实存在的日期才算已盖，其余一律为未盖。
 */
export function recentDaysStatus(
  dates: string[],
  today: string,
  days = 7,
): { date: string; checkedIn: boolean }[] {
  const set = new Set(dates);
  const list: { date: string; checkedIn: boolean }[] = [];
  let cursor = today;
  for (let i = 0; i < days; i++) {
    list.unshift({ date: cursor, checkedIn: set.has(cursor) });
    cursor = previousDay(cursor);
  }
  return list;
}

/** 从今天（或昨天若今日未签）往回连算连续天数 */
export function computeStreak(
  dates: string[],
  today: string,
  checkedToday: boolean,
): number {
  const set = new Set(dates);
  let cursor = checkedToday ? today : previousDay(today);
  if (!set.has(cursor)) return 0;
  let streak = 0;
  while (set.has(cursor)) {
    streak += 1;
    cursor = previousDay(cursor);
  }
  return streak;
}
