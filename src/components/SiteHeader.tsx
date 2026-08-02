import { getFeatureFlags } from "@/lib/modules";
import { getSessionUser, isAdmin } from "@/lib/auth";
import {
  PRIMARY_NAV_KEYS,
  MORE_NAV_KEYS,
  buildNavLinks,
} from "@/lib/nav";
import { SiteNav } from "@/components/SiteNav";

export async function SiteHeader() {
  const [flags, user] = await Promise.all([
    getFeatureFlags(),
    getSessionUser(),
  ]);
  const primary = buildNavLinks(flags, PRIMARY_NAV_KEYS);
  const more = buildNavLinks(flags, MORE_NAV_KEYS);

  return (
    <SiteNav
      primary={primary}
      more={more}
      showAdmin={!!user && isAdmin(user.role)}
      displayName={user ? user.displayName : "未建档"}
    />
  );
}
