import { assertModuleEnabled } from "@/lib/modules";
import { getDb, rowsFrom } from "@/lib/db";
import { canModerate, getSessionUser } from "@/lib/auth";
import { pickFeaturedEvent } from "@/lib/events-rules";
import { isPollOpen, shouldShowPollResults } from "@/lib/poll-rules";
import { EventsClient } from "./EventsClient";

export default async function EventsPage() {
  await assertModuleEnabled("events-hub");
  const user = await getSessionUser();
  const db = await getDb();
  const events = rowsFrom<{
    id: number;
    title: string;
    kind: string;
    description: string;
    starts_at: string | null;
    status: string;
    rsvp_count: number;
    my_rsvp: number;
  }>(
    db,
    // my_rsvp：当前登录用户是否已报名（未登录时 user_id 为 -1，恒为 0）
    `SELECT e.*,
      (SELECT COUNT(*) FROM event_rsvps r WHERE r.event_id = e.id) as rsvp_count,
      (SELECT COUNT(*) FROM event_rsvps m WHERE m.event_id = e.id AND m.user_id = ?) as my_rsvp
     FROM events e WHERE e.published = 1 ORDER BY e.created_at DESC`,
    [user?.id ?? -1],
  );
  const eventsView = events.map((e) => ({
    ...e,
    joined: Number(e.my_rsvp) > 0,
  }));
  const featured = pickFeaturedEvent(events);
  const polls = rowsFrom<{
    id: number;
    question: string;
    options: string;
    show_live: number;
    ends_at: string | null;
  }>(db, `SELECT * FROM polls ORDER BY id DESC`).map((p) => {
    const options = JSON.parse(p.options || "[]") as string[];
    const votes = rowsFrom<{ option_index: number; c: number }>(
      db,
      `SELECT option_index, COUNT(*) as c FROM poll_votes WHERE poll_id = ? GROUP BY option_index`,
      [p.id],
    );
    const open = isPollOpen(p.ends_at);
    const showResults = shouldShowPollResults(p.ends_at, !!p.show_live);
    // 当前用户在这场投票中选的选项下标，未投为 null
    const mine = user
      ? rowsFrom<{ option_index: number }>(
          db,
          `SELECT option_index FROM poll_votes WHERE poll_id = ? AND user_id = ?`,
          [p.id, user.id],
        )[0]
      : undefined;
    return {
      myVote: mine ? Number(mine.option_index) : null,
      id: p.id,
      question: p.question,
      options,
      endsAt: p.ends_at,
      open,
      showResults,
      tallies: options.map(
        (_, idx) => Number(votes.find((v) => v.option_index === idx)?.c ?? 0),
      ),
    };
  });

  return (
    <div>
      <h1 className="brand-font text-3xl text-[var(--cyan)]">活动中枢</h1>
      <p className="mt-2 text-sm text-[var(--fog)]">公告、报名、投票。</p>
      {featured ? (
        <div className="panel mt-6 rounded-2xl p-5">
          <p className="text-xs tracking-[0.2em] text-[var(--amber)]">焦点活动</p>
          <h2 className="brand-font mt-1 text-2xl text-[var(--cyan)]">
            {featured.title}
          </h2>
          <p className="mt-2 text-sm text-[var(--fog)]">
            {featured.starts_at || "时间待定"}
            {" · "}
            已报名 {Number(featured.rsvp_count)} 人
          </p>
        </div>
      ) : null}
      <EventsClient
        events={eventsView}
        polls={polls}
        canModerate={!!user && canModerate(user.role)}
      />
    </div>
  );
}
