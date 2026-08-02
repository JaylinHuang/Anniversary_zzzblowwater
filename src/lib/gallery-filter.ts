export type GalleryCard = {
  id: number;
  title: string;
  path: string;
  likes: number;
  display_name: string;
  tags: string[];
};

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
