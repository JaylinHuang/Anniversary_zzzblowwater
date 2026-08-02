"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useToast } from "@/components/ToastProvider";
import { apiFetch } from "@/lib/api-client";

export function GamesClient({
  pieces,
  questions,
  canModerate,
}: {
  pieces: {
    piece_index: number;
    user_id: number | null;
    display_name: string | null;
  }[];
  questions: {
    id: number;
    question: string;
    options: string[];
    badge: string | null;
  }[];
  canModerate: boolean;
}) {
  const router = useRouter();
  const { success, error } = useToast();
  const [gacha, setGacha] = useState("");
  const [fortune, setFortune] = useState("");
  const [quizMsg, setQuizMsg] = useState("");
  const [spinning, setSpinning] = useState(false);
  const [guess, setGuess] = useState<{
    roundId: string;
    content: string;
    options: string[];
  } | null>(null);
  const [guessMsg, setGuessMsg] = useState("");
  const [guessBusy, setGuessBusy] = useState(false);

  async function spin() {
    setSpinning(true);
    try {
      const data = await apiFetch<{
        member: { display_name: string; bio?: string };
        quote?: string | null;
      }>("/api/games", {
        method: "POST",
        body: JSON.stringify({ action: "gacha" }),
      });
      setGacha(
        `${data.member.display_name}\n${data.member.bio || "神秘档案"}\n${
          data.quote ? `「${data.quote}」` : ""
        }`,
      );
      success("扭蛋开出一位群友");
    } catch (e) {
      error(e instanceof Error ? e.message : "扭蛋失败");
    } finally {
      setSpinning(false);
    }
  }

  async function drawFortune() {
    try {
      const data = await apiFetch<{ slip: string }>("/api/games", {
        method: "POST",
        body: JSON.stringify({ action: "fortune" }),
      });
      setFortune(data.slip);
      success("今日签已就绪");
    } catch (e) {
      error(e instanceof Error ? e.message : "求签失败");
    }
  }

  async function answer(questionId: number, answerIndex: number) {
    try {
      const data = await apiFetch<{ correct: boolean; badge?: string | null }>(
        "/api/games",
        {
          method: "POST",
          body: JSON.stringify({ action: "quiz", questionId, answerIndex }),
        },
      );
      const msg = data.correct
        ? `答对了！${data.badge ? `获得徽章：${data.badge}` : ""}`
        : "不对哦，再想想群里的梗";
      setQuizMsg(msg);
      if (data.correct) success(msg);
      else error(msg);
      router.refresh();
    } catch (e) {
      error(e instanceof Error ? e.message : "答题失败");
    }
  }

  async function light(pieceIndex: number) {
    try {
      await apiFetch("/api/games", {
        method: "POST",
        body: JSON.stringify({ action: "puzzle", pieceIndex }),
      });
      success("拼图块已点亮");
      router.refresh();
    } catch (e) {
      error(e instanceof Error ? e.message : "点亮失败");
    }
  }

  async function startGuess() {
    setGuessBusy(true);
    setGuessMsg("");
    try {
      const data = await apiFetch<{
        roundId: string;
        content: string;
        options: string[];
      }>("/api/games", {
        method: "POST",
        body: JSON.stringify({ action: "guess-start" }),
      });
      setGuess({
        roundId: data.roundId,
        content: data.content,
        options: data.options,
      });
    } catch (e) {
      setGuess(null);
      error(e instanceof Error ? e.message : "出题失败");
    } finally {
      setGuessBusy(false);
    }
  }

  async function answerGuess(answerIndex: number) {
    if (!guess || guessBusy) return;
    setGuessBusy(true);
    try {
      const data = await apiFetch<{ correct: boolean; answer: string }>(
        "/api/games",
        {
          method: "POST",
          body: JSON.stringify({
            action: "guess-answer",
            roundId: guess.roundId,
            answerIndex,
          }),
        },
      );
      const msg = data.correct
        ? `答对了！就是「${data.answer}」`
        : `惜败——正确答案是「${data.answer}」`;
      setGuessMsg(msg);
      if (data.correct) success(msg);
      else error(msg);
      setGuess(null);
    } catch (e) {
      error(e instanceof Error ? e.message : "提交失败");
    } finally {
      setGuessBusy(false);
    }
  }

  async function addQuiz() {
    const question = prompt("题目？");
    if (!question) return;
    const options = (prompt("选项，用 | 分隔") || "")
      .split("|")
      .map((s) => s.trim())
      .filter(Boolean);
    if (options.length < 2) {
      error("至少需要两个选项");
      return;
    }
    const answerIndex = Number(prompt("正确答案索引（从 0 开始）") || "0");
    const badge = prompt("答对徽章名（可空）") || "";
    try {
      await apiFetch("/api/games", {
        method: "POST",
        body: JSON.stringify({
          action: "add-quiz",
          question,
          options,
          answerIndex,
          badge: badge || null,
        }),
      });
      success("题目已添加");
      router.refresh();
    } catch (e) {
      error(e instanceof Error ? e.message : "出题失败");
    }
  }

  return (
    <div className="mt-8 space-y-8">
      <section className="panel rounded-2xl p-6">
        <p className="text-xs tracking-[0.2em] text-[var(--cyan)]">今日推荐</p>
        <h2 className="mt-1 text-[var(--amber)]">猜说话人</h2>
        <p className="mt-2 text-sm text-[var(--fog)]">
          从群聊归档抽一句，猜是谁说的（需已导入语料）。
        </p>
        <button
          className="btn mt-4"
          type="button"
          disabled={guessBusy}
          onClick={() => void startGuess()}
        >
          {guessBusy ? "出题中…" : guess ? "换一题" : "来一题"}
        </button>
        {guessMsg ? (
          <p className="mt-3 text-sm text-[var(--cyan)]">{guessMsg}</p>
        ) : null}
        {guess ? (
          <div className="mt-4">
            <p className="text-lg text-[var(--ink)]">「{guess.content}」</p>
            <div className="mt-4 flex flex-wrap gap-2">
              {guess.options.map((opt, idx) => (
                <button
                  key={`${opt}-${idx}`}
                  type="button"
                  className="btn btn-ghost"
                  disabled={guessBusy}
                  onClick={() => void answerGuess(idx)}
                >
                  {opt}
                </button>
              ))}
            </div>
          </div>
        ) : null}
      </section>

      <section className="panel rounded-2xl p-6">
        <h2 className="text-[var(--amber)]">群友扭蛋</h2>
        <button className="btn mt-4" type="button" onClick={spin} disabled={spinning}>
          {spinning ? "运转中…" : "转动扭蛋"}
        </button>
        {gacha ? (
          <pre className="mt-4 whitespace-pre-wrap text-sm text-[var(--ink)]">
            {gacha}
          </pre>
        ) : null}
      </section>

      <section className="panel rounded-2xl p-6">
        <h2 className="text-[var(--amber)]">每日签</h2>
        <button className="btn mt-4" type="button" onClick={drawFortune}>
          今日求签
        </button>
        {fortune ? <p className="mt-4 text-sm">{fortune}</p> : null}
      </section>

      <section className="panel rounded-2xl p-6">
        <div className="flex items-center justify-between">
          <h2 className="text-[var(--amber)]">群梗考试</h2>
          {canModerate ? (
            <button className="btn btn-ghost" type="button" onClick={addQuiz}>
              出题
            </button>
          ) : null}
        </div>
        {quizMsg ? <p className="mt-2 text-sm text-[var(--cyan)]">{quizMsg}</p> : null}
        <div className="mt-4 space-y-4">
          {questions.map((q) => (
            <div key={q.id} className="rounded-xl border border-[var(--line)] p-4">
              <p className="text-sm">{q.question}</p>
              <div className="mt-3 flex flex-wrap gap-2">
                {q.options.map((opt, idx) => (
                  <button
                    key={opt}
                    type="button"
                    className="btn btn-ghost"
                    onClick={() => answer(q.id, idx)}
                  >
                    {opt}
                  </button>
                ))}
              </div>
            </div>
          ))}
          {questions.length === 0 ? (
            <p className="text-sm text-[var(--fog)]">暂无题目</p>
          ) : null}
        </div>
      </section>

      <section className="panel rounded-2xl p-6">
        <h2 className="text-[var(--amber)]">合作拼图</h2>
        <p className="mt-2 text-sm text-[var(--fog)]">每人每天最多点亮 3 块</p>
        <div className="mt-4 grid grid-cols-6 gap-1">
          {pieces.map((p) => (
            <button
              key={p.piece_index}
              type="button"
              disabled={!!p.user_id}
              onClick={() => light(p.piece_index)}
              title={p.display_name || "未点亮"}
              className="aspect-square rounded-sm border border-[var(--line)] transition"
              style={{
                background: p.user_id
                  ? `linear-gradient(135deg, rgba(61,224,208,${0.35 + (p.piece_index % 6) * 0.08}), rgba(240,163,94,0.35))`
                  : "rgba(0,0,0,0.25)",
              }}
            />
          ))}
        </div>
      </section>
    </div>
  );
}
