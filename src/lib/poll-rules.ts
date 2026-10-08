import { todayKey } from "@/lib/date-key";

/** 按北京时间的日历日比较：ends_at 当天仍可投（含截止日） */
export function dayKey(d = new Date()): string {
  return todayKey(d);
}

export function isPollOpen(endsAt: string | null | undefined, now = new Date()) {
  if (!endsAt) return true;
  return dayKey(now) <= String(endsAt).slice(0, 10);
}

/** 开启期：show_live 时展示；结束后始终展示最终结果 */
export function shouldShowPollResults(
  endsAt: string | null | undefined,
  showLive: boolean,
  now = new Date(),
) {
  if (!isPollOpen(endsAt, now)) return true;
  return showLive;
}
