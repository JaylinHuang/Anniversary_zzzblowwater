export type GalleryCard = {
  id: number;
  title: string;
  path: string;
  likes: number;
  display_name: string;
  tags: string[];
  avatar_url?: string | null;
  user_id?: number;
  /** 当前用户是否已赞过 */
  liked?: boolean;
};

/** 馆内列表的展示状态：有内容 / 馆是空的 / 筛选后为空 */
export type GalleryEmptyState = "none" | "gallery-empty" | "filter-empty";

/** 根据总数、筛选结果数与查询词，判断应显示哪种空状态 */
export function getGalleryEmptyState(
  total: number,
  filteredCount: number,
  query: string,
): GalleryEmptyState {
  if (total === 0) return "gallery-empty";
  if (filteredCount === 0 && query.trim()) return "filter-empty";
  return "none";
}

/** 乐观更新点赞：返回切换后的赞状态与数量（数量不会小于 0） */
export function toggleLikeState(
  liked: boolean,
  likes: number,
): { liked: boolean; likes: number } {
  return liked
    ? { liked: false, likes: Math.max(0, likes - 1) }
    : { liked: true, likes: likes + 1 };
}

export function parseTags(raw: string): string[] {
  try {
    const v = JSON.parse(raw || "[]");
    return Array.isArray(v) ? v.map(String) : [];
  } catch {
    return raw
      ? raw
          .split(/[,，\s]+/)
          .map((t) => t.trim())
          .filter(Boolean)
      : [];
  }
}

export function filterGallery(
  items: GalleryCard[],
  query: string,
): GalleryCard[] {
  const q = query.trim().toLowerCase();
  if (!q) return items;
  return items.filter((m) => {
    const hay = [m.title, m.display_name, ...m.tags].join(" ").toLowerCase();
    return hay.includes(q);
  });
}
