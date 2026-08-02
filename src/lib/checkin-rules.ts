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
