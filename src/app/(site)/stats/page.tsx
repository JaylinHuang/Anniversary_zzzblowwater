import { assertModuleEnabled } from "@/lib/modules";
import { getDb, rowFrom } from "@/lib/db";
import { computeFunStats } from "@/lib/stats";
import { requireUser } from "@/lib/auth";

export default async function StatsPage() {
  await assertModuleEnabled("fun-stats");
  await requireUser();
  const db = await getDb();
  const pub = rowFrom<{ value: string }>(
    db,
    `SELECT value FROM site_settings WHERE key = 'stats_public'`,
  );
  if (pub?.value !== "1") {
    return (
      <div>
        <h1 className="brand-font text-3xl text-[var(--cyan)]">趣味统计</h1>
        <p className="mt-4 text-[var(--fog)]">管理员已关闭公开统计。</p>
      </div>
    );
  }
  const anon = rowFrom<{ value: string }>(
    db,
    `SELECT value FROM site_settings WHERE key = 'stats_anonymous'`,
  );
  const stats = await computeFunStats(anon?.value === "1");

  return (
    <div>
      <h1 className="brand-font text-3xl text-[var(--cyan)]">趣味统计</h1>
      <p className="mt-2 text-sm text-[var(--fog)]">
        基于导入的群聊记忆 · 共 {stats.totalMessages} 条
        {anon?.value === "1" ? " · 匿名榜" : ""}
      </p>
      <div className="mt-8 grid gap-6 md:grid-cols-2">
        <section className="panel rounded-2xl p-5">
          <h2 className="text-[var(--amber)]">话痨榜</h2>
          <ol className="mt-4 space-y-2 text-sm">
            {stats.leaderboard.map((r) => (
              <li key={r.rank} className="flex justify-between">
                <span>
                  #{r.rank} {r.name}
                </span>
                <span className="text-[var(--cyan)]">{r.count}</span>
              </li>
            ))}
          </ol>
        </section>
        <section className="panel rounded-2xl p-5">
          <h2 className="text-[var(--amber)]">深夜修仙</h2>
          <p className="mt-4 text-3xl text-[var(--cyan)]">
            {stats.nightOwlMessages}
            <span className="ml-2 text-lg text-[var(--amber)]">
              {stats.nightOwlPercent}%
            </span>
          </p>
          <p className="mt-2 text-sm text-[var(--fog)]">
            23:00–04:59 时段发言数 · 占有时间戳消息的比例
          </p>
          <div className="mt-6 flex h-24 items-end gap-1">
            {stats.hourBuckets.map((h) => (
              <div
                key={h.hour}
                className="flex-1 rounded-t bg-[var(--cyan)]/40"
                style={{
                  height: `${Math.max(8, (Number(h.count) / Math.max(...stats.hourBuckets.map((x) => Number(x.count)), 1)) * 100)}%`,
                }}
                title={`${h.hour}:00 · ${h.count}`}
              />
            ))}
          </div>
        </section>
        <section className="panel rounded-2xl p-5 md:col-span-2">
          <h2 className="text-[var(--amber)]">高频词云（近似）</h2>
          <div className="mt-4 flex flex-wrap gap-2">
            {stats.words.map((w) => (
              <span
                key={w.word}
                className="rounded-full border border-[var(--line)] px-3 py-1"
                style={{
                  fontSize: `${Math.min(1.6, 0.75 + w.count / 40)}rem`,
                  opacity: Math.min(1, 0.45 + w.count / 80),
                }}
              >
                {w.word}
              </span>
            ))}
          </div>
        </section>
      </div>
    </div>
  );
}
