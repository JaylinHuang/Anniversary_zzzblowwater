import { assertModuleEnabled } from "@/lib/modules";
import { getDb, rowsFrom } from "@/lib/db";
import { canModerate, getSessionUser } from "@/lib/auth";
import { GalleryClient } from "./GalleryClient";

export default async function GalleryPage() {
  await assertModuleEnabled("media-gallery");
  const user = await getSessionUser();
  const db = await getDb();
  const items = rowsFrom<{
    id: number;
    title: string;
    path: string;
    likes: number;
    display_name: string;
    tags: string;
  }>(
    db,
    `SELECT m.id, m.title, m.path, m.likes, m.tags, u.display_name
     FROM media_items m JOIN users u ON u.id = m.user_id
     WHERE m.status = 'approved' ORDER BY m.created_at DESC`,
  );
  const pending = canModerate(user!.role)
    ? rowsFrom<{ id: number; title: string; path: string }>(
        db,
        `SELECT id, title, path FROM media_items WHERE status = 'pending'`,
      )
    : [];

  return (
    <div>
      <h1 className="brand-font text-3xl text-[var(--cyan)]">Meme 馆</h1>
      <p className="mt-2 text-sm text-[var(--fog)]">
        群内截图与表情包。非官方素材，仅供群友回忆。
      </p>
      <GalleryClient
        items={items}
        pending={pending}
        canModerate={canModerate(user!.role)}
      />
    </div>
  );
}
