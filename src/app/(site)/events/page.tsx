import { assertModuleEnabled } from "@/lib/modules";
import { getDb, rowsFrom } from "@/lib/db";
import { canModerate, getSessionUser } from "@/lib/auth";
import { pickFeaturedEvent } from "@/lib/events-rules";
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
  }>(
    db,
    `SELECT e.*,
      (SELECT COUNT(*) FROM event_rsvps r WHERE r.event_id = e.id) as rsvp_count
     FROM events e WHERE e.published = 1 ORDER BY e.created_at DESC`,
  );
  const featured = pickFeaturedEvent(events);
  const polls = rowsFrom<{
    id: number;
    question: string;
    options: string;
    show_live: number;
  }>(db, `SELECT * FROM polls ORDER BY id DESC`).map((p) => {
    const options = JSON.parse(p.options || "[]") as string[];
    const votes = rowsFrom<{ option_index: number; c: number }>(
      db,
      `SELECT option_index, COUNT(*) as c FROM poll_votes WHERE poll_id = ? GROUP BY option_index`,
      [p.id],
    );
    return {
      id: p.id,
      question: p.question,
      options,
      showLive: !!p.show_live,
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
        events={events}
        polls={polls}
        canModerate={!!user && canModerate(user.role)}
      />
    </div>
  );
}
