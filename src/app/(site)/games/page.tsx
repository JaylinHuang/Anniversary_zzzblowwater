import { assertModuleEnabled } from "@/lib/modules";
import { getDb, rowsFrom } from "@/lib/db";
import { GamesClient } from "./GamesClient";
import { canModerate, getSessionUser } from "@/lib/auth";

export default async function GamesPage() {
  await assertModuleEnabled("party-games");
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
    }),
  );

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
      />
    </div>
  );
}
