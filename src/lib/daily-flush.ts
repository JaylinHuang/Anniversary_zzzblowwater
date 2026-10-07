import { getDb, rowFrom, withDb } from "@/lib/db";

/** 每天跟进新导入的钟点，按北京时间 */
export const DAILY_FLUSH_HOUR = 4;

const REFRESH_KEY = "import_refresh_at";

let refreshing = false;

/** 北京时间的年月日时，hour 为 0–23 */
export function shanghaiClock(now: Date): {
  year: number;
  month: number;
  day: number;
  hour: number;
} {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Shanghai",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    hourCycle: "h23",
  }).formatToParts(now);
  const num = (type: string) =>
    Number(parts.find((part) => part.type === type)?.value ?? "0");
  let hour = num("hour");
  if (hour === 24) hour = 0;
  return { year: num("year"), month: num("month"), day: num("day"), hour };
}

export function shanghaiDayKey(now: Date): string {
  const clock = shanghaiClock(now);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${clock.year}-${pad(clock.month)}-${pad(clock.day)}`;
}

/**
 * 是否到了该跟进的时候。
 * 北京时间 4 点之前不跑；当天已经跟进过也不再跑。
 * 服务若错过 4 点，当天稍后启动时补跑一次。
 */
export function flushIsDue(
  now: Date,
  lastFlushIso: string | null,
  hour = DAILY_FLUSH_HOUR,
): boolean {
  const clock = shanghaiClock(now);
  if (clock.hour < hour) return false;
  if (!lastFlushIso) return true;
  const last = new Date(lastFlushIso);
  if (Number.isNaN(last.getTime())) return true;
  return shanghaiDayKey(last) !== shanghaiDayKey(now);
}

async function lastRefreshAt(): Promise<string | null> {
  const db = await getDb();
  return (
    rowFrom<{ value: string }>(
      db,
      `SELECT value FROM site_settings WHERE key = ?`,
      [REFRESH_KEY],
    )?.value ?? null
  );
}

async function rememberRefresh(iso: string) {
  await withDb((db) => {
    db.run(
      `INSERT INTO site_settings (key, value) VALUES (?, ?)
       ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
      [REFRESH_KEY, iso],
    );
  });
}

/** 到点后，有新导入才重炼分身并重建向量。没有新批次也记下今天已看过。 */
export async function runScheduledFlush(now = new Date()): Promise<boolean> {
  if (refreshing) return false;
  const last = await lastRefreshAt();
  if (!flushIsDue(now, last)) return false;
  refreshing = true;
  try {
    const { refreshImportedAgents } = await import("@/lib/import-refresh");
    await refreshImportedAgents();
    await rememberRefresh(now.toISOString());
    return true;
  } finally {
    refreshing = false;
  }
}

/** 进程内每分钟看一次，到点或错过当天 4 点后补跑 */
export function startDailyFlushLoop() {
  const g = globalThis as { __dailyFlushLoop?: boolean };
  if (g.__dailyFlushLoop) return;
  if (process.env.NEXT_PHASE === "phase-production-build") return;
  g.__dailyFlushLoop = true;
  const tick = () => {
    void import("@/lib/import-refresh")
      .then((mod) => mod.catchUpExistingAgents())
      .catch((error) => {
        console.error(
          "[agent-train]",
          error instanceof Error ? error.message : "failed",
        );
      });
    void runScheduledFlush().catch((error) => {
      console.error(
        "[daily-flush]",
        error instanceof Error ? error.message : "failed",
      );
    });
  };
  const timer = setInterval(tick, 60_000);
  timer.unref?.();
  tick();
}
