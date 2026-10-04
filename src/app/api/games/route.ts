import { createHash, randomBytes } from "crypto";
import { NextResponse } from "next/server";
import { requireModerator, requireUser } from "@/lib/auth";
import { guessDailyLimit } from "@/lib/constants";
import { todayKey } from "@/lib/date-key";
import { assertModuleEnabled } from "@/lib/modules";
import { getDb, rowFrom, rowsFrom, withDb } from "@/lib/db";
import {
  PUZZLE_DAILY_LIMIT,
  gamesDayKey,
  puzzleRemaining,
  quizStatusFrom,
} from "@/lib/games-daily";
import { buildGuessRound, gradeGuess } from "@/lib/guess-speaker";

const FORTUNES = [
  "今日适合打深渊，欧气藏在第三抽。",
  "少抬杠，多发图，群友会记得你。",
  "签曰：稳住，我们能出金。",
  "宜联机，忌熬夜——但你大概还是会熬。",
  "一句冷梗可能成为明年金句。",
  "今日人品：新艾利都天气晴，适合摸鱼。",
  "遇见随机群友，请友善比心。",
  "签面空白：说明今天由你来写故事。",
];

/** 玩法当天的日期键：本地年月日，与首页签到（todayKey）同一天 */
function dayKey(d = new Date()) {
  return gamesDayKey(d);
}

export async function GET() {
  try {
    await assertModuleEnabled("party-games");
    const user = await requireUser();
    const db = await getDb();
    const today = dayKey();
    // 今日签：来自 fortune_draws
    const fortuneRow = rowFrom<{ slip: string }>(
      db,
      `SELECT slip FROM fortune_draws WHERE user_id = ? AND day_key = ?`,
      [user.id, today],
    );
    // 今日已点亮次数：来自 puzzle_daily
    const dailyRow = rowFrom<{ count: number }>(
      db,
      `SELECT count FROM puzzle_daily WHERE user_id = ? AND day_key = ?`,
      [user.id, today],
    );
    // 我的答题记录：来自 quiz_answers
    const myAnswers = rowsFrom<{ question_id: number; correct: number }>(
      db,
      `SELECT question_id, correct FROM quiz_answers WHERE user_id = ?`,
      [user.id],
    );
    const pieces = rowsFrom<{
      piece_index: number;
      user_id: number | null;
      lit_at: string | null;
      display_name: string | null;
    }>(
      db,
      `SELECT p.piece_index, p.user_id, p.lit_at, u.display_name
       FROM puzzle_pieces p
       LEFT JOIN users u ON u.id = p.user_id
       ORDER BY p.piece_index`,
    );
    const questions = rowsFrom(
      db,
      `SELECT id, question, options, badge FROM quiz_questions WHERE active = 1`,
    ).map((q) => ({
      ...q,
      options: JSON.parse(String(q.options || "[]")),
    }));
    return NextResponse.json({
      pieces,
      questions: questions.map((q) => {
        const mine = myAnswers.find((a) => a.question_id === Number(q.id));
        return { ...q, myStatus: quizStatusFrom(mine?.correct) };
      }),
      fortune: fortuneRow?.slip ?? null,
      puzzleRemaining: puzzleRemaining(dailyRow?.count),
    });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "ERROR" },
      { status: 400 },
    );
  }
}

export async function POST(req: Request) {
  try {
    await assertModuleEnabled("party-games");
    const user = await requireUser();
    const body = await req.json();
    const action = String(body.action || "");

    if (action === "gacha") {
      const db = await getDb();
      const members = rowsFrom<{
        id: number;
        display_name: string;
        bio: string;
        mains: string;
      }>(
        db,
        `SELECT id, display_name, bio, mains FROM users WHERE public_profile = 1`,
      );
      if (!members.length) {
        return NextResponse.json({ error: "暂无可抽取公开成员" }, { status: 400 });
      }
      const pick = members[Math.floor(Math.random() * members.length)];
      const quote = rowFrom<{ content: string }>(
        db,
        `SELECT content FROM chat_messages WHERE is_quote = 1 AND sender = ? ORDER BY RANDOM() LIMIT 1`,
        [pick.display_name],
      );
      return NextResponse.json({
        member: pick,
        quote: quote?.content ?? null,
      });
    }

    if (action === "fortune") {
      const key = dayKey();
      const checkedIn = !!rowFrom(
        await getDb(),
        `SELECT 1 as ok FROM daily_checkins WHERE user_id = ? AND checkin_date = ?`,
        [user.id, key],
      );
      const existing = await withDb((db) => {
        const row = rowFrom<{ slip: string }>(
          db,
          `SELECT slip FROM fortune_draws WHERE user_id = ? AND day_key = ?`,
          [user.id, key],
        );
        if (row) return row.slip;
        const hash = createHash("sha256")
          .update(`${user.id}:${key}`)
          .digest("hex");
        const idx = parseInt(hash.slice(0, 8), 16) % FORTUNES.length;
        let slip = FORTUNES[idx];
        // 今日已打卡则附加盖章加成文案（乐趣联动，不改签面本体哈希）
        if (checkedIn) {
          slip = `${slip}（打卡加成：今日印章加持，欧气 +1）`;
        }
        db.run(
          `INSERT INTO fortune_draws (user_id, day_key, slip) VALUES (?, ?, ?)`,
          [user.id, key, slip],
        );
        return slip;
      });
      return NextResponse.json({
        slip: existing,
        day: key,
        checkinBonus: checkedIn,
      });
    }

    if (action === "quiz") {
      const questionId = Number(body.questionId);
      const answerIndex = Number(body.answerIndex);
      const result = await withDb((db) => {
        const q = rowFrom<{
          answer_index: number;
          badge: string | null;
        }>(db, `SELECT answer_index, badge FROM quiz_questions WHERE id = ?`, [
          questionId,
        ]);
        if (!q) throw new Error("题目不存在");
        const correct = q.answer_index === answerIndex ? 1 : 0;
        db.run(
          `INSERT OR REPLACE INTO quiz_answers (user_id, question_id, correct) VALUES (?, ?, ?)`,
          [user.id, questionId, correct],
        );
        if (correct && q.badge) {
          const u = rowFrom<{ badges: string }>(
            db,
            `SELECT badges FROM users WHERE id = ?`,
            [user.id],
          );
          const badges = JSON.parse(u?.badges || "[]") as string[];
          if (!badges.includes(q.badge)) {
            badges.push(q.badge);
            db.run(`UPDATE users SET badges = ? WHERE id = ?`, [
              JSON.stringify(badges),
              user.id,
            ]);
          }
        }
        return { correct: !!correct, badge: correct ? q.badge : null };
      });
      return NextResponse.json(result);
    }

    if (action === "puzzle") {
      const pieceIndex = Number(body.pieceIndex);
      const key = dayKey();
      if (!Number.isInteger(pieceIndex)) {
        return NextResponse.json({ error: "拼图块不存在" }, { status: 400 });
      }
      await withDb((db) => {
        const piece = rowFrom<{ user_id: number | null }>(
          db,
          `SELECT user_id FROM puzzle_pieces WHERE piece_index = ?`,
          [pieceIndex],
        );
        if (!piece) throw new Error("拼图块不存在");
        if (piece.user_id) throw new Error("该块已被点亮");
        const daily = rowFrom<{ count: number }>(
          db,
          `SELECT count FROM puzzle_daily WHERE user_id = ? AND day_key = ?`,
          [user.id, key],
        );
        const count = daily?.count ?? 0;
        if (puzzleRemaining(count) <= 0) {
          throw new Error(`今日点亮次数已用完（${PUZZLE_DAILY_LIMIT}次）`);
        }
        db.run(
          `UPDATE puzzle_pieces SET user_id = ?, lit_at = datetime('now') WHERE piece_index = ?`,
          [user.id, pieceIndex],
        );
        db.run(
          `INSERT INTO puzzle_daily (user_id, day_key, count) VALUES (?, ?, 1)
           ON CONFLICT(user_id, day_key) DO UPDATE SET count = count + 1`,
          [user.id, key],
        );
      });
      return NextResponse.json({ ok: true });
    }

    if (action === "add-quiz") {
      await requireModerator();
      await withDb((db) => {
        db.run(
          `INSERT INTO quiz_questions (question, options, answer_index, badge)
           VALUES (?, ?, ?, ?)`,
          [
            String(body.question || ""),
            JSON.stringify(body.options || []),
            Number(body.answerIndex),
            body.badge || null,
          ],
        );
      });
      return NextResponse.json({ ok: true });
    }

    if (action === "guess-start") {
      const db = await getDb();
      const limit = guessDailyLimit();
      // 本次请求统一使用同一个本地日期（与 todayKey 一致），计数与写入都用它
      const today = todayKey();
      const countUsed = (d: typeof db) =>
        Number(
          rowFrom<{ c: number }>(
            d,
            `SELECT COUNT(*) as c FROM guess_rounds
             WHERE user_id = ? AND day_key = ?`,
            [user.id, today],
          )?.c ?? 0,
        );
      const used = countUsed(db);
      if (used >= limit) {
        return NextResponse.json(
          { error: `今日猜题已达上限（${limit} 题）` },
          { status: 400 },
        );
      }
      const lines = rowsFrom<{
        id: number;
        sender: string;
        content: string;
      }>(
        db,
        `SELECT m.id, m.sender, m.content
         FROM chat_messages m
         JOIN import_batches b ON b.id = m.batch_id
         WHERE b.status = 'active'
         ORDER BY m.id DESC LIMIT 800`,
      );
      const seed =
        (Date.now() ^ (user.id * 9973) ^ randomBytes(2).readUInt16BE(0)) >>> 0;
      const round = buildGuessRound(lines, seed);
      if (!round) {
        return NextResponse.json(
          { error: "归档语料不足，无法出题（需至少 2 位发言人）" },
          { status: 400 },
        );
      }
      const id = randomBytes(12).toString("hex");
      const inserted = await withDb((db2) => {
        // 写入前在同一同步段内再核对一次上限，避免并发请求越过上限
        if (countUsed(db2) >= limit) return false;
        db2.run(
          `INSERT INTO guess_rounds
           (id, user_id, message_id, content, options, answer_index, day_key)
           VALUES (?, ?, ?, ?, ?, ?, ?)`,
          [
            id,
            user.id,
            round.messageId,
            round.content,
            JSON.stringify(round.options),
            round.answerIndex,
            today,
          ],
        );
        return true;
      });
      if (!inserted) {
        return NextResponse.json(
          { error: `今日猜题已达上限（${limit} 题）` },
          { status: 400 },
        );
      }
      return NextResponse.json({
        ok: true,
        roundId: id,
        content: round.content,
        options: round.options,
      });
    }

    if (action === "guess-answer") {
      const roundId = String(body.roundId || "");
      const chosen = Number(body.answerIndex);
      const result = await withDb((db) => {
        const row = rowFrom<{
          user_id: number;
          answer_index: number;
          answered: number;
          options: string;
        }>(db, `SELECT * FROM guess_rounds WHERE id = ?`, [roundId]);
        if (!row || row.user_id !== user.id) throw new Error("题目不存在");
        if (row.answered) throw new Error("这题已经答过了");
        const correct = gradeGuess(row.answer_index, chosen) ? 1 : 0;
        db.run(
          `UPDATE guess_rounds SET answered = 1, correct = ? WHERE id = ?`,
          [correct, roundId],
        );
        const options = JSON.parse(row.options || "[]") as string[];
        return {
          correct: !!correct,
          answer: options[row.answer_index] ?? null,
        };
      });
      return NextResponse.json(result);
    }

    return NextResponse.json({ error: "未知操作" }, { status: 400 });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "ERROR" },
      { status: 400 },
    );
  }
}
