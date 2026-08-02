import { notFound } from "next/navigation";
import { assertModuleEnabled } from "@/lib/modules";
import { getDb, rowFrom } from "@/lib/db";
import { getSessionUser } from "@/lib/auth";

export default async function MemberDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await assertModuleEnabled("member-codex");
  const { id } = await params;
  const me = await getSessionUser();
  const db = await getDb();
  const m = rowFrom<{
    id: number;
    display_name: string;
    bio: string;
    tags: string;
    mains: string;
    badges: string;
    public_profile: number;
    role: string;
  }>(db, `SELECT * FROM users WHERE id = ?`, [Number(id)]);
  if (!m) notFound();
  if (!m.public_profile && m.id !== me?.id && me?.role !== "admin") notFound();

  const tags = JSON.parse(m.tags || "[]") as string[];
  const badges = JSON.parse(m.badges || "[]") as string[];

  return (
    <div className="panel max-w-xl rounded-2xl p-8">
      <p className="text-xs tracking-[0.2em] text-[var(--amber)]">CODEX</p>
      <h1 className="brand-font mt-2 text-4xl text-[var(--cyan)]">
        {m.display_name}
      </h1>
      <p className="mt-4 text-[var(--fog)]">{m.bio || "神秘绳匠，暂无档案。"}</p>
      {m.mains ? (
        <p className="mt-3 text-sm text-[var(--amber)]">擅长：{m.mains}</p>
      ) : null}
      <div className="mt-6 flex flex-wrap gap-2">
        {tags.map((t) => (
          <span
            key={t}
            className="rounded-full border border-[var(--line)] px-3 py-1 text-sm"
          >
            {t}
          </span>
        ))}
        {badges.map((b) => (
          <span
            key={b}
            className="rounded-full border border-[rgba(240,163,94,0.45)] px-3 py-1 text-sm text-[var(--amber)]"
          >
            {b}
          </span>
        ))}
      </div>
    </div>
  );
}
