import { assertModuleEnabled } from "@/lib/modules";
import { getDb, rowFrom, rowsFrom } from "@/lib/db";
import { GamesClient } from "./GamesClient";
import { canModerate, getSessionUser } from "@/lib/auth";
import {
  gamesDayKey,
  puzzleRemaining,
  quizStatusFrom,
} from "@/lib/games-daily";

/** 「今天」随本地日期变化，页面每次请求都重新计算，不做静态缓存 */
export const dynamic = "force-dynamic";

export default async function GamesPage() {
  await assertModuleEnabled("party-games");
  // 本次请求统一使用同一个本地日期（与首页签到的 todayKey 一致）
  const today = gamesDayKey();
  const user = await getSessionUser();
  const db = await getDb();
  const pieces = rowsFrom<{
    piece_index: number;
    user_id: number | null;
    display_name: string | null;
  }>(
    db,
    `SELECT p.piece_index, p.user_id, u.display_name
     FROM puzzle_pieces p LEFT JOIN users u ON u.id = p.user_id
     ORDER BY p.piece_index`,
  );

  // 我的答题记录（来自 quiz_answers，刷新后不丢）
  const myAnswers = user
    ? rowsFrom<{ question_id: number; correct: number }>(
        db,
        `SELECT question_id, correct FROM quiz_answers WHERE user_id = ?`,
        [user.id],
      )
    : [];
  const answerMap = new Map(myAnswers.map((a) => [a.question_id, a.correct]));

  const questions = rowsFrom<{
    id: number;
    question: string;
    options: string;
    badge: string | null;
  }>(db, `SELECT id, question, options, badge FROM quiz_questions WHERE active = 1`).map(
    (q) => ({
      id: q.id,
      question: q.question,
      options: JSON.parse(q.options || "[]") as string[],
      badge: q.badge,
      myStatus: quizStatusFrom(answerMap.get(q.id)),
    }),
  );

  // 今日签（来自 fortune_draws）
  const todayFortune = user
    ? (rowFrom<{ slip: string }>(
        db,
        `SELECT slip FROM fortune_draws WHERE user_id = ? AND day_key = ?`,
        [user.id, today],
      )?.slip ?? null)
    : null;

  // 今日剩余点亮次数（来自 puzzle_daily）
  const dailyUsed = user
    ? rowFrom<{ count: number }>(
        db,
        `SELECT count FROM puzzle_daily WHERE user_id = ? AND day_key = ?`,
        [user.id, today],
      )?.count
    : undefined;

  // 没有题目时提示谁来出题：管理员与版主
  const quizMasters = rowsFrom<{ display_name: string }>(
    db,
    `SELECT display_name FROM users
     WHERE role IN ('admin', 'moderator') ORDER BY role, id`,
  ).map((r) => r.display_name);

  return (
    <div>
      <h1 className="brand-font text-3xl text-[var(--cyan)]">周年玩法</h1>
      <p className="mt-2 text-sm text-[var(--fog)]">
        推荐先玩「猜说话人」或扭蛋；下面还有求签、考试和拼图。
      </p>
      <GamesClient
        pieces={pieces}
        questions={questions}
        canModerate={!!user && canModerate(user.role)}
        initialFortune={todayFortune}
        puzzleRemaining={puzzleRemaining(dailyUsed)}
        quizMasters={quizMasters}
      />
    </div>
  );
}
