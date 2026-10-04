import { assertModuleEnabled } from "@/lib/modules";
import { getDb, rowFrom, rowsFrom } from "@/lib/db";
import { wishDailyLimit } from "@/lib/constants";
import {
  COUNT_WISHES_TODAY_SQL,
  localDayRangeUtc,
  wishRemaining,
} from "@/lib/wish-rules";
import {
  capsuleViewerParams,
  SELECT_CAPSULES_FOR_VIEWER_SQL,
} from "@/lib/capsule-rules";
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
    avatar_url: string | null;
    user_id: number;
    created_at: string;
  }>(
    db,
    `SELECT w.id, w.content, w.created_at, w.user_id, u.display_name, u.avatar_url
     FROM wishes w
     JOIN users u ON u.id = w.user_id WHERE w.hidden = 0
     ORDER BY w.created_at DESC`,
  );
  // 胶囊正文由 SQL 按查看者决定是否下发；未登录用 -1，永远匹配不到作者
  const viewerId = user?.id ?? -1;
  const capsules = rowsFrom<{
    id: number;
    unlock_on: string;
    display_name: string;
    avatar_url: string | null;
    user_id: number;
    content: string | null;
    unlocked: number;
    viewer_only: number;
  }>(db, SELECT_CAPSULES_FOR_VIEWER_SQL, capsuleViewerParams(viewerId));

  // 今日额度：已贴条数来自库内该用户今天的真实记录
  const limit = wishDailyLimit();
  const { start, end } = localDayRangeUtc();
  const used = user
    ? Number(
        rowFrom<{ c: number }>(db, COUNT_WISHES_TODAY_SQL, [
          user.id,
          start,
          end,
        ])?.c ?? 0,
      )
    : 0;

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
        currentUserId={user?.id ?? null}
        remaining={wishRemaining(limit, used)}
        dailyLimit={limit}
      />
    </div>
  );
}
