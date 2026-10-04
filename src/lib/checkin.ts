import { computeStreak, recentDaysStatus, stampForDate } from "@/lib/checkin-rules";
import { todayKey } from "@/lib/date-key";
import { getDb, rowFrom, rowsFrom, withDb } from "@/lib/db";

export type CheckinStatus = {
  today: string;
  checkedIn: boolean;
  stamp: string;
  streak: number;
  total: number;
  recent: { date: string; stamp: string }[];
  /** 最近 7 天（含今天）逐日是否已盖章，从早到晚 */
  recentDays: { date: string; checkedIn: boolean }[];
};

export async function getCheckinStatus(userId: number): Promise<CheckinStatus> {
  const today = todayKey();
  const db = await getDb();
  const rows = rowsFrom<{ checkin_date: string; stamp: string }>(
    db,
    `SELECT checkin_date, stamp FROM daily_checkins
     WHERE user_id = ? ORDER BY checkin_date DESC LIMIT 60`,
    [userId],
  );
  const dates = rows.map((r) => r.checkin_date);
  const checkedIn = dates.includes(today);
  return {
    today,
    checkedIn,
    stamp: stampForDate(today),
    streak: computeStreak(dates, today, checkedIn),
    total: Number(
      rowFrom<{ c: number }>(
        db,
        `SELECT COUNT(*) as c FROM daily_checkins WHERE user_id = ?`,
        [userId],
      )?.c ?? 0,
    ),
    recent: rows.slice(0, 7).map((r) => ({
      date: r.checkin_date,
      stamp: r.stamp,
    })),
    recentDays: recentDaysStatus(dates, today, 7),
  };
}

export async function performCheckin(userId: number): Promise<CheckinStatus> {
  const today = todayKey();
  const stamp = stampForDate(today);
  await withDb((db) => {
    db.run(
      `INSERT OR IGNORE INTO daily_checkins (user_id, checkin_date, stamp)
       VALUES (?, ?, ?)`,
      [userId, today, stamp],
    );
  });
  return getCheckinStatus(userId);
}

export async function todayCheckinCount(): Promise<number> {
  const db = await getDb();
  const row = rowFrom<{ c: number }>(
    db,
    `SELECT COUNT(*) as c FROM daily_checkins WHERE checkin_date = ?`,
    [todayKey()],
  );
  return Number(row?.c ?? 0);
}
