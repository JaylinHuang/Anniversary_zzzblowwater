/** 周年玩法的每日规则（纯函数，无 IO） */
import { todayKey } from "./date-key";

/** 每人每天可点亮拼图的次数 */
export const PUZZLE_DAILY_LIMIT = 3;

/** 玩法日期键：与首页签到共用同一个本地日期（本地年月日），避免跨零点后与打卡记录对不上 */
export function gamesDayKey(d = new Date()): string {
  return todayKey(d);
}

/** 根据今日已点亮次数，算出还剩几次（不会小于 0） */
export function puzzleRemaining(used: number | null | undefined): number {
  const n = Number(used ?? 0);
  if (!Number.isFinite(n) || n < 0) return PUZZLE_DAILY_LIMIT;
  return Math.max(0, PUZZLE_DAILY_LIMIT - n);
}

/** 题目作答状态：未答 / 答对 / 答错 */
export type QuizStatus = "unanswered" | "correct" | "wrong";

/** 把 quiz_answers 里的 correct 字段转成作答状态 */
export function quizStatusFrom(
  correct: number | null | undefined,
): QuizStatus {
  if (correct === null || correct === undefined) return "unanswered";
  return Number(correct) === 1 ? "correct" : "wrong";
}
