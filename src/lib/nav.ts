import { MODULE_META, type ModuleKey } from "@/lib/constants";

/** 顶栏主入口：群友最常点的 5 个 */
export const PRIMARY_NAV_KEYS: ModuleKey[] = [
  "wish-wall",
  "party-games",
  "chat-archive",
  "member-agents",
  "member-codex",
];

/** 「更多」里的次级模块 */
export const MORE_NAV_KEYS: ModuleKey[] = [
  "memory-timeline",
  "fun-stats",
  "events-hub",
  "media-gallery",
  "lore-constellation",
];

export type NavLink = {
  key: ModuleKey;
  label: string;
  href: string;
};

export function buildNavLinks(
  enabled: Record<ModuleKey, boolean>,
  keys: ModuleKey[],
): NavLink[] {
  return keys
    .filter((k) => enabled[k])
    .map((k) => ({
      key: k,
      label: MODULE_META[k].label,
      href: MODULE_META[k].href,
    }));
}

export function isNavActive(pathname: string, href: string) {
  if (href === "/") return pathname === "/";
  return pathname === href || pathname.startsWith(`${href}/`);
}
