/** 活动中枢排序/筛选纯规则 */

export type EventLike = {
  id: number;
  title: string;
  starts_at: string | null;
  status: string;
  rsvp_count?: number;
};

export function isEventOpen(status: string): boolean {
  return status === "open";
}

/** 活动允许写入的报名状态：open 开放报名，closed 已关闭报名 */
export const EVENT_STATUSES = ["open", "closed"] as const;
export type EventStatus = (typeof EVENT_STATUSES)[number];

/** 校验外部传入的状态值是否合法 */
export function isEventStatus(value: unknown): value is EventStatus {
  return (
    typeof value === "string" &&
    (EVENT_STATUSES as readonly string[]).includes(value)
  );
}

/** 版主切换按钮文案：开放中则显示「关闭报名」，已关闭则显示「重新开放报名」 */
export function toggleStatusLabel(status: string): string {
  return isEventOpen(status) ? "关闭报名" : "重新开放报名";
}

/** 点击切换按钮后应写入的目标状态 */
export function nextEventStatus(status: string): EventStatus {
  return isEventOpen(status) ? "closed" : "open";
}

/** 选出最近一场未开始的开放活动；若无未来场次则取最近一场开放活动 */
export function pickFeaturedEvent(
  events: EventLike[],
  now = new Date(),
): EventLike | null {
  const open = events.filter((e) => isEventOpen(e.status));
  if (!open.length) return null;
  const withTime = open
    .filter((e) => e.starts_at)
    .map((e) => ({
      e,
      t: new Date(e.starts_at!.replace(" ", "T")).getTime(),
    }))
    .filter((x) => Number.isFinite(x.t));

  const upcoming = withTime
    .filter((x) => x.t >= now.getTime())
    .sort((a, b) => a.t - b.t);
  if (upcoming.length) return upcoming[0].e;

  const past = withTime.sort((a, b) => b.t - a.t);
  if (past.length) return past[0].e;
  return open[0];
}

/** 报名按钮文案：随当前用户报名状态变化 */
export function rsvpButtonLabel(joined: boolean, status: string): string {
  if (joined) return "取消报名";
  if (!isEventOpen(status)) return "已关闭报名";
  return "报名参加";
}

/** 报名按钮是否可点：已报名者始终可取消；未报名时需活动仍开放 */
export function canToggleRsvp(joined: boolean, status: string): boolean {
  return joined || isEventOpen(status);
}

/** 我在某场投票中所选项的文案；未投过返回 null */
export function myVoteLabel(
  options: string[],
  myVote: number | null | undefined,
): string | null {
  if (myVote === null || myVote === undefined) return null;
  return options[myVote] ?? `选项${myVote}`;
}

/** 活动空状态：写明下一步由谁来发布 */
export function emptyEventsHint(canPublish: boolean): string {
  return canPublish
    ? "还没有活动。你有发布权限，可在上方表单直接发布第一条活动或公告。"
    : "还没有活动。活动由版主或管理员发布，发布后会出现在这里，届时可直接报名。";
}

/** 投票空状态：写明下一步由谁来发起 */
export function emptyPollsHint(canPublish: boolean): string {
  return canPublish
    ? "暂无投票。你可以点上方「新建投票」发起第一场投票。"
    : "暂无投票。投票由版主或管理员发起，发起后你可以在这里选择，截止前可随时改选。";
}
