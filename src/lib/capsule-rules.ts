import { todayKey } from "./date-key";

/** 时间胶囊是否已到解锁日（按本地日期键比较） */
export function isCapsuleUnlocked(
  unlockOn: string,
  today = todayKey(),
): boolean {
  const day = unlockOn.slice(0, 10);
  return day <= today;
}

export function daysUntilUnlock(
  unlockOn: string,
  today = todayKey(),
): number {
  if (isCapsuleUnlocked(unlockOn, today)) return 0;
  const a = new Date(today + "T00:00:00");
  const b = new Date(unlockOn.slice(0, 10) + "T00:00:00");
  return Math.max(
    0,
    Math.ceil((b.getTime() - a.getTime()) / (24 * 60 * 60 * 1000)),
  );
}

/** 转义 LIKE 通配符，避免用户输入 %/_ 打爆检索 */
export function escapeLikePattern(q: string): string {
  return q.replace(/\\/g, "\\\\").replace(/%/g, "\\%").replace(/_/g, "\\_");
}
