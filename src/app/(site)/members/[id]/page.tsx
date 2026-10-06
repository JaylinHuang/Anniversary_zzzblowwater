import { notFound } from "next/navigation";
import { PageStage } from "@/components/fx/PageStage";
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
    avatar_url: string | null;
  }>(db, `SELECT * FROM users WHERE id = ?`, [Number(id)]);
  if (!m) notFound();
  if (!m.public_profile && m.id !== me?.id && me?.role !== "admin") notFound();

  const tags = JSON.parse(m.tags || "[]") as string[];
  const badges = JSON.parse(m.badges || "[]") as string[];
  const initial = (m.display_name || "?").slice(0, 1);

  return (
    <PageStage
      code="HDD-01"
      channel="CODEX"
      title={m.display_name}
      lede={m.bio || "神秘绳匠，暂无档案。"}
    >
      <div className="dossier">
        <span className="inline-flex h-36 w-36 items-center justify-center overflow-hidden border border-[rgba(61,224,208,0.4)] bg-[rgba(61,224,208,0.1)] brand-font text-5xl text-[var(--cyan)]">
          {m.avatar_url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={m.avatar_url}
              alt=""
              className="h-full w-full object-cover"
            />
          ) : (
            initial
          )}
        </span>
        <div className="panel rounded-2xl p-6">
      <p className="text-[var(--fog)]">{m.bio || "神秘绳匠，暂无档案。"}</p>
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
      </div>
    </PageStage>
  );
}
