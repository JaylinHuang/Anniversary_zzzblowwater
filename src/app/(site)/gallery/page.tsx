import { PageStage } from "@/components/fx/PageStage";
import { assertModuleEnabled } from "@/lib/modules";
import { getDb, rowsFrom } from "@/lib/db";
import { canModerate, getSessionUser } from "@/lib/auth";
import type { GalleryComment } from "@/lib/gallery-comments";
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
    avatar_url: string | null;
    user_id: number;
    tags: string;
    liked: number;
  }>(
    db,
    // liked：当前用户是否已赞过（0/1）
    `SELECT m.id, m.title, m.path, m.likes, m.tags, m.user_id,
            u.display_name, u.avatar_url,
            EXISTS(SELECT 1 FROM media_likes l
                   WHERE l.media_id = m.id AND l.user_id = ?) AS liked
     FROM media_items m JOIN users u ON u.id = m.user_id
     WHERE m.status = 'approved' ORDER BY m.created_at DESC`,
    [user!.id],
  );
  // 已通过图片下的全部评论（谁说的、说了什么），按图片分组后交给客户端
  const comments = rowsFrom<GalleryComment>(
    db,
    `SELECT c.id, c.media_id, c.user_id, c.content, c.created_at,
            u.display_name, u.avatar_url
     FROM media_comments c
     JOIN media_items m ON m.id = c.media_id AND m.status = 'approved'
     JOIN users u ON u.id = c.user_id
     ORDER BY c.created_at ASC, c.id ASC`,
  );
  const pending = canModerate(user!.role)
    ? rowsFrom<{ id: number; title: string; path: string }>(
        db,
        `SELECT id, title, path FROM media_items WHERE status = 'pending'`,
      )
    : [];

  return (
    <PageStage
      code="HDD-08"
      channel="MEME"
      title="Meme 馆"
      lede="群内截图与表情包。非官方素材，仅供群友回忆。"
      rail={
        <div className="page-index">
          <p className="eyebrow">WALL</p>
          <p className="mt-2 text-sm text-[var(--fog)]">
            已通过 {items.length} 张
            {pending.length ? ` · 待审 ${pending.length}` : ""}
          </p>
        </div>
      }
    >
      <GalleryClient
        items={items}
        pending={pending}
        comments={comments}
        canModerate={canModerate(user!.role)}
      />
    </PageStage>
  );
}
