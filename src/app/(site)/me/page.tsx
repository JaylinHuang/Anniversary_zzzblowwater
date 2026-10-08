import Link from "next/link";
import { redirect } from "next/navigation";
import { PageStage } from "@/components/fx/PageStage";
import { getSessionUser, isAdmin } from "@/lib/auth";
import type { Role } from "@/lib/constants";
import { getCheckinStatus } from "@/lib/checkin";
import { formatBeijingDate } from "@/lib/date-key";
import { getDb, rowFrom, rowsFrom } from "@/lib/db";
import { ProfilePanel } from "./ProfilePanel";

function maskQq(qq: string | null) {
  if (!qq) return "未绑定";
  if (qq.length <= 4) return qq;
  return `${qq.slice(0, 3)}****${qq.slice(-2)}`;
}

export default async function MePage() {
  const user = await getSessionUser();
  if (!user) redirect("/gate");

  const db = await getDb();
  const row = rowFrom<{
    id: number;
    display_name: string;
    qq_number: string | null;
    bio: string;
    mains: string;
    tags: string;
    badges: string;
    role: string;
    public_profile: number;
    opt_out_leaderboard: number;
    created_at: string;
    avatar_url: string | null;
  }>(
    db,
    `SELECT id, display_name, qq_number, bio, mains, tags, badges, role,
            public_profile, opt_out_leaderboard, created_at, avatar_url
     FROM users WHERE id = ?`,
    [user.id],
  );
  if (!row) redirect("/gate");

  const checkin = await getCheckinStatus(user.id);
  const wishCount = Number(
    rowFrom<{ c: number }>(
      db,
      `SELECT COUNT(*) as c FROM wishes WHERE user_id = ? AND hidden = 0`,
      [user.id],
    )?.c ?? 0,
  );
  const capsuleCount = Number(
    rowFrom<{ c: number }>(
      db,
      `SELECT COUNT(*) as c FROM capsules WHERE user_id = ?`,
      [user.id],
    )?.c ?? 0,
  );
  const quizCorrect = Number(
    rowFrom<{ c: number }>(
      db,
      `SELECT COUNT(*) as c FROM quiz_answers WHERE user_id = ? AND correct = 1`,
      [user.id],
    )?.c ?? 0,
  );
  const puzzleLit = Number(
    rowFrom<{ c: number }>(
      db,
      `SELECT COUNT(*) as c FROM puzzle_pieces WHERE user_id = ?`,
      [user.id],
    )?.c ?? 0,
  );
  const rsvpCount = Number(
    rowFrom<{ c: number }>(
      db,
      `SELECT COUNT(*) as c FROM event_rsvps WHERE user_id = ?`,
      [user.id],
    )?.c ?? 0,
  );
  const pollVotes = rowsFrom<{ question: string; option_index: number; options: string }>(
    db,
    `SELECT p.question, p.options, v.option_index
     FROM poll_votes v
     JOIN polls p ON p.id = v.poll_id
     WHERE v.user_id = ?
     ORDER BY p.id DESC LIMIT 5`,
    [user.id],
  ).map((v) => {
    const options = JSON.parse(v.options || "[]") as string[];
    return {
      question: v.question,
      choice: options[v.option_index] ?? `选项 ${v.option_index}`,
    };
  });

  const tags = JSON.parse(row.tags || "[]") as string[];
  const badges = JSON.parse(row.badges || "[]") as string[];
  const initial = row.display_name.slice(0, 1) || "?";
  const roleLabel = isAdmin(row.role as Role)
    ? "管理员"
    : row.role === "moderator"
      ? "版主"
      : "成员";

  const stats = [
    { label: "连续签到", value: `${checkin.streak}`, unit: "天" },
    { label: "累计签到", value: `${checkin.total}`, unit: "次" },
    { label: "祝福", value: `${wishCount}`, unit: "条" },
    { label: "胶囊", value: `${capsuleCount}`, unit: "封" },
    { label: "答对群梗", value: `${quizCorrect}`, unit: "题" },
    { label: "拼图贡献", value: `${puzzleLit}`, unit: "块" },
  ];

  return (
    <PageStage
      code="HDD-00"
      channel="PROFILE"
      title="个人中心"
      lede={row.bio || "还没有自我介绍，在下方编辑名片补上吧。"}
    >
      <div className="space-y-6">

      {/* 身份卡 */}
      <section className="panel relative overflow-hidden rounded-2xl p-6 md:p-8">
        <div className="pointer-events-none absolute -right-10 -top-10 h-40 w-40 rounded-full bg-[radial-gradient(circle,rgba(61,224,208,0.2),transparent_70%)]" />
        <div className="relative flex flex-col gap-6 sm:flex-row sm:items-center">
          <Link
            href="/me/avatar"
            className="relative flex h-20 w-20 shrink-0 items-center justify-center overflow-hidden rounded-2xl border border-[rgba(61,224,208,0.45)] bg-[rgba(61,224,208,0.08)] brand-font text-3xl text-[var(--cyan)]"
            title="更换头像"
          >
            {row.avatar_url ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={row.avatar_url}
                alt=""
                className="h-full w-full object-cover"
              />
            ) : (
              initial
            )}
          </Link>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="brand-font truncate text-2xl text-[var(--ink)] md:text-3xl">
                {row.display_name}
              </h2>
              <span className="rounded-full border border-[rgba(240,163,94,0.45)] px-2.5 py-0.5 text-xs text-[var(--amber)]">
                {roleLabel}
              </span>
              {checkin.checkedIn ? (
                <span className="rounded-full border border-[rgba(61,224,208,0.45)] px-2.5 py-0.5 text-xs text-[var(--cyan)]">
                  今日已签 · {checkin.stamp}
                </span>
              ) : (
                <span className="rounded-full border border-[var(--line)] px-2.5 py-0.5 text-xs text-[var(--fog)]">
                  今日未签到
                </span>
              )}
            </div>
            <p className="mt-2 text-sm text-[var(--fog)]">
              {row.bio || "还没有自我介绍，在下方编辑名片补上吧。"}
            </p>
            <dl className="mt-3 flex flex-wrap gap-x-5 gap-y-1 text-xs text-[var(--fog)]">
              <div>
                <dt className="inline text-[var(--fog)]">QQ </dt>
                <dd className="inline text-[var(--ink)]">
                  {maskQq(row.qq_number)}
                </dd>
              </div>
              <div>
                <dt className="inline text-[var(--fog)]">建档 </dt>
                <dd className="inline text-[var(--ink)]">
                  {row.created_at ? formatBeijingDate(row.created_at) : "—"}
                </dd>
              </div>
              <div>
                <dt className="inline text-[var(--fog)]">活动报名 </dt>
                <dd className="inline text-[var(--ink)]">{rsvpCount} 次</dd>
              </div>
            </dl>
            {row.mains ? (
              <p className="mt-2 text-sm text-[var(--amber)]">擅长：{row.mains}</p>
            ) : null}
            <div className="mt-3 flex flex-wrap gap-2">
              {tags.map((t) => (
                <span
                  key={t}
                  className="rounded-full border border-[var(--line)] px-2.5 py-0.5 text-xs"
                >
                  {t}
                </span>
              ))}
              {badges.map((b) => (
                <span
                  key={b}
                  className="rounded-full border border-[rgba(240,163,94,0.45)] px-2.5 py-0.5 text-xs text-[var(--amber)]"
                >
                  {b}
                </span>
              ))}
            </div>
          </div>
          <div className="flex shrink-0 flex-col gap-2 sm:items-end">
            <Link href="/me/avatar" className="btn btn-ghost text-sm">
              {row.avatar_url ? "更换头像" : "设置头像"}
            </Link>
            <Link href={`/members/${row.id}`} className="btn btn-ghost text-sm">
              查看公开名片
            </Link>
          </div>
        </div>
      </section>

      {/* 数据看板 */}
      <section>
        <h2 className="stage-sec">我的足迹</h2>
        <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
          {stats.map((s) => (
            <div
              key={s.label}
              className="panel rounded-2xl px-4 py-4 text-center"
            >
              <div className="brand-font text-2xl text-[var(--cyan)]">
                {s.value}
                <span className="ml-0.5 text-sm text-[var(--fog)]">
                  {s.unit}
                </span>
              </div>
              <div className="mt-1 text-xs text-[var(--fog)]">{s.label}</div>
            </div>
          ))}
        </div>
      </section>

      {/* 近七日签到印章 */}
      <section className="panel rounded-2xl p-5">
        <h2 className="stage-sec">最近签到</h2>
        {checkin.recent.length ? (
          <ul className="mt-4 flex flex-wrap gap-2">
            {checkin.recent.map((r) => (
              <li
                key={r.date}
                className="rounded-xl border border-[var(--line)] px-3 py-2 text-center text-xs"
              >
                <div className="text-[var(--cyan)]">{r.stamp}</div>
                <div className="mt-1 text-[var(--fog)]">{r.date.slice(5)}</div>
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-3 text-sm text-[var(--fog)]">
            还没有签到记录，回首页点一下今日签到吧。
          </p>
        )}
      </section>

      {/* 投票记录 */}
      <section className="panel rounded-2xl p-5">
        <h2 className="stage-sec">我的投票</h2>
        {pollVotes.length ? (
          <ul className="mt-3 space-y-2 text-sm">
            {pollVotes.map((v) => (
              <li
                key={v.question}
                className="rounded-xl border border-[var(--line)] px-3 py-2"
              >
                <div className="text-[var(--fog)]">{v.question}</div>
                <div className="mt-1 text-[var(--cyan)]">→ {v.choice}</div>
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-3 text-sm text-[var(--fog)]">尚未参与投票。</p>
        )}
      </section>

      <ProfilePanel
        initial={{
          displayName: row.display_name,
          bio: row.bio || "",
          mains: row.mains || "",
          tags: tags.join("，"),
          publicProfile: !!row.public_profile,
          optOutLeaderboard: !!row.opt_out_leaderboard,
        }}
      />
      </div>
    </PageStage>
  );
}
