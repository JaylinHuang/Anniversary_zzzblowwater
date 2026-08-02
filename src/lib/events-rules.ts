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
