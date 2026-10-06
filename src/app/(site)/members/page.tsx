import { PageStage } from "@/components/fx/PageStage";
import { assertModuleEnabled } from "@/lib/modules";
import { getDb, rowsFrom } from "@/lib/db";
import { getSessionUser } from "@/lib/auth";
import { ProfileEditor } from "./ProfileEditor";
import { MembersBrowse } from "./MembersBrowse";

export default async function MembersPage() {
  await assertModuleEnabled("member-codex");
  const me = await getSessionUser();
  const db = await getDb();
  const members = rowsFrom<{
    id: number;
    display_name: string;
    bio: string;
    tags: string;
    mains: string;
    badges: string;
    public_profile: number;
    avatar_url: string | null;
  }>(
    db,
    `SELECT id, display_name, bio, tags, mains, badges, public_profile, avatar_url
     FROM users ORDER BY id`,
  )
    .filter(
      (m) => m.public_profile || m.id === me?.id || me?.role === "admin",
    )
    .map((m) => ({
      id: m.id,
      display_name: m.display_name,
      bio: m.bio,
      tags: JSON.parse(m.tags || "[]") as string[],
      mains: m.mains,
      badges: JSON.parse(m.badges || "[]") as string[],
      avatar_url: m.avatar_url,
    }));

  return (
    <PageStage
      code="HDD-01"
      channel="CODEX"
      title="群友图鉴"
      lede="收集每一位同行者。可在下方编辑自己的名片与隐私设置。"
      rail={
        <div className="page-index">
          <p className="eyebrow">COUNT</p>
          <p className="mt-2 font-[family-name:var(--font-display)] text-3xl text-[var(--cyan)]">
            {members.length}
          </p>
          <p className="text-xs text-[var(--fog)]">张公开名片</p>
        </div>
      }
    >
      {me ? <ProfileEditor userId={me.id} /> : null}
      <MembersBrowse members={members} />
    </PageStage>
  );
}
