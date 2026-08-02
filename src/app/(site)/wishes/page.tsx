import { assertModuleEnabled } from "@/lib/modules";
import { getDb, rowsFrom } from "@/lib/db";
import { canModerate, getSessionUser } from "@/lib/auth";
import { WishClient } from "./WishClient";

export default async function WishesPage() {
  await assertModuleEnabled("wish-wall");
  const user = await getSessionUser();
  const db = await getDb();
  const wishes = rowsFrom<{
    id: number;
    content: string;
    display_name: string;
    created_at: string;
  }>(
    db,
    `SELECT w.id, w.content, w.created_at, u.display_name FROM wishes w
     JOIN users u ON u.id = w.user_id WHERE w.hidden = 0
     ORDER BY w.created_at DESC`,
  );
  const capsules = rowsFrom<{
    id: number;
    unlock_on: string;
    display_name: string;
    content: string | null;
    unlocked: number;
  }>(
    db,
    `SELECT c.id, c.unlock_on, u.display_name,
            CASE WHEN date(c.unlock_on) <= date('now') THEN c.content ELSE NULL END as content,
            CASE WHEN date(c.unlock_on) <= date('now') THEN 1 ELSE 0 END as unlocked
     FROM capsules c JOIN users u ON u.id = c.user_id
     ORDER BY c.unlock_on ASC`,
  );

  return (
    <div>
      <h1 className="brand-font text-3xl text-[var(--cyan)]">祝福墙</h1>
      <p className="mt-2 text-sm text-[var(--fog)]">
        公开祝福，或投一封给未来的时间胶囊。
      </p>
      <WishClient
        wishes={wishes}
        capsules={capsules}
        canModerate={!!user && canModerate(user.role)}
      />
    </div>
  );
}
