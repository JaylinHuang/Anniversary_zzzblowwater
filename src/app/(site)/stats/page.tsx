import Link from "next/link";
import { PageStage } from "@/components/fx/PageStage";
import { assertModuleEnabled } from "@/lib/modules";
import { getDb, rowFrom } from "@/lib/db";
import { computeFunStats } from "@/lib/stats";
import { requireUser } from "@/lib/auth";
import { HourTimeline } from "./HourTimeline";

/** 空态下一步：说明当前为空，并提示去群聊归档导入（含 /archive 入口） */
function EmptyNext({ what }: { what: string }) {
  return (
    <div
      className="mt-4 text-sm text-[var(--fog)]"
      data-testid="stats-empty-next"
    >
      <p>{what}</p>
      <p className="mt-2">
        下一步：去群聊归档导入（或补全）聊天记录，导入后这里会自动出现统计。
      </p>
      <Link
        href="/archive"
        className="mt-3 inline-block rounded-full border border-[var(--cyan)] px-4 py-1 text-[var(--cyan)]"
      >
        去群聊归档导入
      </Link>
    </div>
  );
}

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
      <PageStage
        code="HDD-04"
        channel="FUN STATS"
        title="趣味统计"
        lede="管理员已关闭公开统计。"
      >
        <p className="text-sm text-[var(--fog)]">公开榜暂时收起。</p>
      </PageStage>
    );
  }
  const anon = rowFrom<{ value: string }>(
    db,
    `SELECT value FROM site_settings WHERE key = 'stats_anonymous'`,
  );
  const stats = await computeFunStats(anon?.value === "1");

  // 按块独立判断空态：各块只看自己的数据列表，不再依赖消息总数
  const noMessages = stats.totalMessages === 0;
  const leaderboardEmpty = stats.leaderboard.length === 0;
  // 时段柱为空（没有带时间戳的消息）才算深夜一块为空；有柱子时即使深夜比例为 0 也照常展示
  const hoursEmpty = stats.hourBuckets.length === 0;
  const wordsEmpty = stats.words.length === 0;

  const top = stats.leaderboard[0];
  const maxCount = Math.max(
    1,
    ...stats.leaderboard.map((r) => Number(r.count) || 0),
  );

  return (
    <PageStage
      code="HDD-04"
      channel="FUN STATS"
      title="趣味统计"
      lede={
        <>
          基于导入的群聊记忆 · 共 {stats.totalMessages} 条
          {anon?.value === "1" ? " · 匿名榜" : ""}
        </>
      }
    >
      <div className="kpi-row">
        <article className="panel">
          <p className="eyebrow">MESSAGES</p>
          <strong>{stats.totalMessages}</strong>
        </article>
        <article className="panel">
          <p className="eyebrow">NIGHT</p>
          <strong>{hoursEmpty ? "—" : `${stats.nightOwlPercent}%`}</strong>
        </article>
        <article className="panel">
          <p className="eyebrow">TOP</p>
          <strong className="truncate text-xl">{top?.name || "—"}</strong>
        </article>
        <article className="panel">
          <p className="eyebrow">WORDS</p>
          <strong>{stats.words.length}</strong>
        </article>
      </div>
      <div className="mt-4 grid gap-4 lg:grid-cols-[minmax(16rem,22rem)_minmax(0,1fr)]">
        <section className="panel rounded-2xl p-5">
          <h2 className="stage-sec">话痨榜</h2>
          {leaderboardEmpty ? (
            <EmptyNext
              what={
                noMessages
                  ? "还没有任何群聊消息，暂时排不出话痨榜。"
                  : "已有群聊消息，但没有可排名的发言人，暂时排不出话痨榜。"
              }
            />
          ) : (
            <ol className="mt-4 space-y-3 text-sm">
              {stats.leaderboard.map((r) => (
                <li key={r.rank}>
                  <div className="flex justify-between">
                    <span>
                      #{r.rank} {r.name}
                    </span>
                    <span className="text-[var(--cyan)]">{r.count}</span>
                  </div>
                  <div className="meter" aria-hidden>
                    <span
                      style={{
                        width: `${(Number(r.count) / maxCount) * 100}%`,
                      }}
                    />
                  </div>
                </li>
              ))}
            </ol>
          )}
        </section>
        <div className="timeline-slot">
          <div className="timeline-stack">
            <section className="panel timeline-panel rounded-2xl p-5">
              <h2 className="stage-sec">发言时间轴</h2>
              {hoursEmpty ? (
                <EmptyNext
                  what={
                    noMessages
                      ? "还没有任何群聊消息，暂时统计不了深夜发言。"
                      : "已有群聊消息，但都没有发言时间，暂时统计不了深夜发言和时段分布。"
                  }
                />
              ) : (
                <>
                  <p className="mt-4 text-3xl text-[var(--cyan)]">
                    {stats.nightOwlMessages.toLocaleString("zh-CN")}
                    <span className="ml-2 text-lg text-[var(--amber)]">
                      {stats.nightOwlPercent}%
                    </span>
                  </p>
                  <p className="mt-2 text-sm text-[var(--fog)]">
                    23:00–04:59 的发言数，以及它在有时间戳的消息里占的比例。下面是一整天 24 小时。
                  </p>
                  <HourTimeline buckets={stats.hourBuckets} />
                </>
              )}
            </section>
            <figure className="timeline-cast">
              {/* 时间轴卡片下面的留白，用抠好的角色填上 */}
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/stats/timeline-cast.png" alt="" />
            </figure>
          </div>
        </div>
        <section className="panel rounded-2xl p-5 lg:col-span-2">
          <h2 className="stage-sec">高频词云</h2>
          {wordsEmpty ? (
            <EmptyNext
              what={
                noMessages
                  ? "还没有任何群聊消息，暂时提不出高频词。"
                  : "已有群聊消息，但清洗后没有能放进词云的词。"
              }
            />
          ) : (
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
          )}
        </section>
      </div>
    </PageStage>
  );
}
