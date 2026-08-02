/** 图鉴检索纯规则 */

export type MemberCard = {
  id: number;
  display_name: string;
  bio: string;
  tags: string[];
  mains: string;
  badges: string[];
};

export function filterMembers(
  members: MemberCard[],
  query: string,
): MemberCard[] {
  const q = query.trim().toLowerCase();
  if (!q) return members;
  return members.filter((m) => {
    const hay = [
      m.display_name,
      m.bio,
      m.mains,
      ...m.tags,
      ...m.badges,
    ]
      .join(" ")
      .toLowerCase();
    return hay.includes(q);
  });
}
