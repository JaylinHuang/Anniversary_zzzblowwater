"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useToast } from "@/components/ToastProvider";
import { GachaCapsule } from "@/components/fx/GachaCapsule";
import { apiFetch } from "@/lib/api-client";
import { PUZZLE_DAILY_LIMIT, type QuizStatus } from "@/lib/games-daily";

/* 扭蛋至少转这么久（ms），接口再快也让摇晃动画看得见 */
const GACHA_MIN_SPIN_MS = 750;
/* 拼图点亮动画播完后撤掉标记的时间（ms），要盖过 router.refresh 的往返 */
const PUZZLE_LIGHT_MS = 1500;

export function GamesClient({
  pieces,
  questions,
  canModerate,
  initialFortune,
  puzzleRemaining,
  quizMasters,
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
    myStatus: QuizStatus;
  }[];
  canModerate: boolean;
  /** 今天已求到的签（来自 fortune_draws），没求过为 null */
  initialFortune: string | null;
  /** 今天还剩几次点亮（来自 puzzle_daily） */
  puzzleRemaining: number;
  /** 管理员 / 版主名单，没有题目时提示他们来出题 */
  quizMasters: string[];
}) {
  const router = useRouter();
  const { success, error } = useToast();
  const [gacha, setGacha] = useState("");
  const [fortune, setFortune] = useState(initialFortune ?? "");
  // 本地剩余次数：点亮成功后立即扣减，服务端刷新后再以服务端为准
  const [remaining, setRemaining] = useState(puzzleRemaining);
  // 本地作答状态：答题后立即更新，服务端刷新后再以服务端为准
  const [localStatus, setLocalStatus] = useState<Record<number, QuizStatus>>(
    {},
  );

  useEffect(() => {
    setRemaining(puzzleRemaining);
  }, [puzzleRemaining]);

  useEffect(() => {
    setFortune(initialFortune ?? "");
  }, [initialFortune]);

  useEffect(() => {
    setLocalStatus({});
  }, [questions]);
  const [quizMsg, setQuizMsg] = useState("");
  const [spinning, setSpinning] = useState(false);
  const [guess, setGuess] = useState<{
    roundId: string;
    content: string;
    options: string[];
  } | null>(null);
  const [guessMsg, setGuessMsg] = useState("");
  const [guessBusy, setGuessBusy] = useState(false);
  /* 扭蛋开出的次数：作为结果区的 key，每次开出都重新播一遍开盖 + 浮现动画 */
  const [gachaRound, setGachaRound] = useState(0);
  /* 刚点亮的拼图块编号：播点亮动画用，动画结束后清掉 */
  const [justLit, setJustLit] = useState<number | null>(null);
  const litTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  /* 组件卸载时清掉还没触发的点亮计时器 */
  useEffect(() => {
    return () => {
      if (litTimer.current) clearTimeout(litTimer.current);
    };
  }, []);

  async function spin() {
    setSpinning(true);
    try {
      /* 请求与最短摇晃时间并行等待，两者都完成才开盖 */
      const [data] = await Promise.all([
        apiFetch<{
          member: { display_name: string; bio?: string };
          quote?: string | null;
        }>("/api/games", {
          method: "POST",
          body: JSON.stringify({ action: "gacha" }),
        }),
        new Promise((resolve) => setTimeout(resolve, GACHA_MIN_SPIN_MS)),
      ]);
      setGachaRound((n) => n + 1);
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
      setLocalStatus((prev) => ({
        ...prev,
        [questionId]: data.correct ? "correct" : "wrong",
      }));
      if (data.correct) success(msg);
      else error(msg);
      router.refresh();
    } catch (e) {
      error(e instanceof Error ? e.message : "答题失败");
    }
  }

  async function light(pieceIndex: number) {
    // 次数用完不再请求，直接提示
    if (remaining <= 0) {
      error(`今日点亮次数已用完（${PUZZLE_DAILY_LIMIT}次）`);
      return;
    }
    try {
      await apiFetch("/api/games", {
        method: "POST",
        body: JSON.stringify({ action: "puzzle", pieceIndex }),
      });
      setRemaining((n) => Math.max(0, n - 1));
      /* 先在本地把这块标成点亮并播动画，不等 refresh 回来 */
      setJustLit(pieceIndex);
      if (litTimer.current) clearTimeout(litTimer.current);
      litTimer.current = setTimeout(() => setJustLit(null), PUZZLE_LIGHT_MS);
      success("拼图块已点亮");
      router.refresh();
    } catch (e) {
      error(e instanceof Error ? e.message : "点亮失败");
      // 失败后刷新，以服务端记录校正剩余次数
      router.refresh();
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
        <div className="mt-4 flex items-center gap-5">
          {/* 胶囊：运转中摇晃，开出后弹盖；key 跟着轮次走，每次都重播开盖 */}
          <GachaCapsule
            key={gachaRound}
            state={spinning ? "spinning" : gacha ? "open" : "idle"}
          />
          <button className="btn" type="button" onClick={spin} disabled={spinning}>
            {spinning ? "运转中…" : "转动扭蛋"}
          </button>
        </div>
        {gacha ? (
          <pre
            key={gachaRound}
            className="gacha-result mt-4 whitespace-pre-wrap text-sm text-[var(--ink)]"
          >
            {gacha}
          </pre>
        ) : null}
      </section>

      <section className="panel rounded-2xl p-6">
        <h2 className="text-[var(--amber)]">每日签</h2>
        {fortune ? (
          <>
            <p className="mt-2 text-xs text-[var(--cyan)]">今日已求签</p>
            <p className="mt-2 text-sm">{fortune}</p>
          </>
        ) : (
          <button className="btn mt-4" type="button" onClick={drawFortune}>
            今日求签
          </button>
        )}
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
          {questions.map((q) => {
            const status = localStatus[q.id] ?? q.myStatus;
            return (
            <div key={q.id} className="rounded-xl border border-[var(--line)] p-4">
              <p className="text-sm">{q.question}</p>
              <p
                className={`mt-1 text-xs ${
                  status === "correct"
                    ? "text-[var(--cyan)]"
                    : status === "wrong"
                      ? "text-[var(--amber)]"
                      : "text-[var(--fog)]"
                }`}
              >
                {status === "correct"
                  ? "已答 · 答对了"
                  : status === "wrong"
                    ? "已答 · 答错了，可再试"
                    : "未答"}
              </p>
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
            );
          })}
          {questions.length === 0 ? (
            <p className="text-sm text-[var(--fog)]">
              暂无题目，等{" "}
              {quizMasters.length
                ? quizMasters.join("、")
                : "管理员或版主"}{" "}
              来出题。
              {canModerate ? "你可以点右上角「出题」。" : ""}
            </p>
          ) : null}
        </div>
      </section>

      <section className="panel rounded-2xl p-6">
        <h2 className="text-[var(--amber)]">合作拼图</h2>
        <p className="mt-2 text-sm text-[var(--fog)]">
          每人每天最多点亮 {PUZZLE_DAILY_LIMIT} 块 ·{" "}
          {remaining > 0
            ? `今天还剩 ${remaining} 次点亮`
            : "今天的点亮次数已用完，明天再来"}
        </p>
        <div className="mt-4 grid grid-cols-6 gap-1">
          {pieces.map((p) => {
            /* 刚点亮的块在 refresh 回来前也按点亮画，闪光淡掉后底下已是亮色 */
            const lighting = justLit === p.piece_index;
            const lit = !!p.user_id || lighting;
            return (
              <button
                key={p.piece_index}
                type="button"
                disabled={!!p.user_id || remaining <= 0}
                onClick={() => light(p.piece_index)}
                title={p.display_name || "未点亮"}
                className={`puzzle-piece aspect-square rounded-sm border border-[var(--line)] transition${
                  lighting ? " is-lighting" : ""
                }`}
                style={{
                  background: lit
                    ? `linear-gradient(135deg, rgba(61,224,208,${0.35 + (p.piece_index % 6) * 0.08}), rgba(240,163,94,0.35))`
                    : "rgba(0,0,0,0.25)",
                }}
              />
            );
          })}
        </div>
      </section>
    </div>
  );
}
