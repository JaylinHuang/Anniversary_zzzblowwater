import { PageStage } from "@/components/fx/PageStage";
import { assertModuleEnabled } from "@/lib/modules";
import { getDb, rowFrom, rowsFrom } from "@/lib/db";
import { canModerate, getSessionUser } from "@/lib/auth";
import { MilestoneForm } from "./MilestoneForm";

export default async function TimelinePage({
  searchParams,
}: {
  searchParams: Promise<{ month?: string; tag?: string }>;
}) {
  await assertModuleEnabled("memory-timeline");
  const sp = await searchParams;
  const user = await getSessionUser();
  const db = await getDb();
  let items = rowsFrom<{
    id: number;
    title: string;
    happened_on: string;
    description: string;
    tags: string;
    quote_id: number | null;
  }>(
    db,
    `SELECT * FROM milestones WHERE published = 1 ORDER BY happened_on ASC`,
  );
  if (sp.month) {
    items = items.filter((i) => i.happened_on.startsWith(sp.month!));
  }
  if (sp.tag) {
    items = items.filter((i) =>
      (JSON.parse(i.tags || "[]") as string[]).includes(sp.tag!),
    );
  }

  return (
    <PageStage
      code="HDD-02"
      channel="TIMELINE"
      title="时光卷轴"
      lede="从建群到一周年的里程碑。正日锚点 7/10，今年庆典 8/4。"
    >
      {user && canModerate(user.role) ? <MilestoneForm /> : null}
      <h2 className="stage-sec">里程碑</h2>
      <div className="timeline-alt">
        {items.map((item) => {
          const tags = JSON.parse(item.tags || "[]") as string[];
          const quote = item.quote_id
            ? rowFrom<{ content: string; sender: string }>(
                db,
                `SELECT content, sender FROM chat_messages WHERE id = ?`,
                [item.quote_id],
              )
            : null;
          return (
            <details
              key={item.id}
              className="panel anim-rise group rounded-2xl p-5 open:border-[rgba(61,224,208,0.4)]"
            >
              <summary className="cursor-pointer list-none">
                <div className="text-xs text-[var(--amber)]">
                  {item.happened_on}
                </div>
                <div className="mt-1 text-lg">{item.title}</div>
              </summary>
              <p className="mt-3 text-sm text-[var(--fog)]">
                {item.description}
              </p>
              {quote ? (
                <blockquote className="mt-3 border-l-2 border-[var(--cyan)] pl-3 text-sm text-[var(--ink)]">
                  “{quote.content}”
                  <footer className="mt-1 text-xs text-[var(--fog)]">
                    — {quote.sender}
                  </footer>
                </blockquote>
              ) : null}
              <div className="mt-3 flex flex-wrap gap-2">
                {tags.map((t) => (
                  <a
                    key={t}
                    href={`/timeline?tag=${encodeURIComponent(t)}`}
                    className="text-xs text-[var(--cyan)]"
                  >
                    #{t}
                  </a>
                ))}
              </div>
            </details>
          );
        })}
        {items.length === 0 ? (
          <p className="text-sm text-[var(--fog)]">还没有里程碑，管理员可添加。</p>
        ) : null}
      </div>
    </PageStage>
  );
}
