import { todayKey } from "./date-key";

/**
 * 校验封存胶囊的解锁日：必须严格是 YYYY-MM-DD（四位年、两位月、两位日），
 * 且是真实存在的日历日期（例如 2026-02-30 不合法）。
 * 合法时返回原字符串，不合法返回 null；不做 trim 或补零，避免宽松格式混入字典序比较。
 */
export function parseCapsuleUnlockOn(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!m) return null;
  const year = Number(m[1]);
  const month = Number(m[2]);
  const day = Number(m[3]);
  if (month < 1 || month > 12 || day < 1) return null;
  // 用 UTC 构造日期再回读，排除 2 月 30 日之类不存在的日期
  const d = new Date(Date.UTC(year, month - 1, day));
  if (
    d.getUTCFullYear() !== year ||
    d.getUTCMonth() !== month - 1 ||
    d.getUTCDate() !== day
  ) {
    return null;
  }
  return value;
}

/** 时间胶囊是否已到解锁日（按本地日期键比较） */
export function isCapsuleUnlocked(
  unlockOn: string,
  today = todayKey(),
): boolean {
  const day = unlockOn.slice(0, 10);
  return day <= today;
}

/**
 * 祝福墙胶囊列表查询。
 * 「今天」不再用 SQLite 的 date('now')（UTC），而是由调用方传入本地日期键（todayKey），
 * 与首页打卡使用同一个本地日期。参数请用 capsuleViewerParams 生成，顺序为：
 * 今天、查看者 id、今天、今天、查看者 id（未登录查看者传 -1）。
 * 正文是否下发完全在 SQL 里决定：
 * - 已到解锁日：所有人可见原文
 * - 未到解锁日：仅作者本人可见原文，其他人拿到的 content 为 NULL（原文不会离开服务端）
 * viewer_only = 1 表示「未解锁、仅作者本人可见」
 */
export const SELECT_CAPSULES_FOR_VIEWER_SQL = `
  SELECT c.id, c.unlock_on, c.created_at, c.user_id, u.display_name, u.avatar_url,
         CASE WHEN substr(c.unlock_on, 1, 10) <= ? OR c.user_id = ?
              THEN c.content ELSE NULL END AS content,
         CASE WHEN substr(c.unlock_on, 1, 10) <= ? THEN 1 ELSE 0 END AS unlocked,
         CASE WHEN substr(c.unlock_on, 1, 10) > ? AND c.user_id = ?
              THEN 1 ELSE 0 END AS viewer_only
  FROM capsules c JOIN users u ON u.id = c.user_id
  ORDER BY c.unlock_on ASC`;

/** 生成 SELECT_CAPSULES_FOR_VIEWER_SQL 的绑定参数；today 默认为本地今天（与首页打卡一致） */
export function capsuleViewerParams(
  viewerId: number,
  today = todayKey(),
): [string, number, string, string, number] {
  return [today, viewerId, today, today, viewerId];
}

export function daysUntilUnlock(
  unlockOn: string,
  today = todayKey(),
): number {
  if (isCapsuleUnlocked(unlockOn, today)) return 0;
  const a = new Date(today + "T00:00:00");
  const b = new Date(unlockOn.slice(0, 10) + "T00:00:00");
  return Math.max(
    0,
    Math.ceil((b.getTime() - a.getTime()) / (24 * 60 * 60 * 1000)),
  );
}

/** 转义 LIKE 通配符，避免用户输入 %/_ 打爆检索 */
export function escapeLikePattern(q: string): string {
  return q.replace(/\\/g, "\\\\").replace(/%/g, "\\%").replace(/_/g, "\\_");
}
