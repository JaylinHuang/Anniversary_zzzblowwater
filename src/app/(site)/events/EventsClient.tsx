"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import { useToast } from "@/components/ToastProvider";
import { apiFetch } from "@/lib/api-client";
import {
  canToggleRsvp,
  emptyEventsHint,
  emptyPollsHint,
  myVoteLabel,
  nextEventStatus,
  rsvpButtonLabel,
  toggleStatusLabel,
} from "@/lib/events-rules";

export function EventsClient({
  events,
  polls,
  canModerate,
}: {
  events: {
    id: number;
    title: string;
    kind: string;
    description: string;
    starts_at: string | null;
    status: string;
    rsvp_count: number;
    /** 当前用户是否已报名 */
    joined: boolean;
  }[];
  polls: {
    id: number;
    question: string;
    options: string[];
    endsAt: string | null;
    open: boolean;
    showResults: boolean;
    tallies: number[];
    /** 当前用户已投的选项下标，未投为 null */
    myVote: number | null;
  }[];
  canModerate: boolean;
}) {
  const router = useRouter();
  const { success, error } = useToast();
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [pollOpen, setPollOpen] = useState(false);
  const [pollQuestion, setPollQuestion] = useState("");
  const [pollOptions, setPollOptions] = useState("");
  const [pollEndsAt, setPollEndsAt] = useState("");

  async function createEvent(e: FormEvent) {
    e.preventDefault();
    try {
      await apiFetch("/api/events", {
        method: "POST",
        body: JSON.stringify({ action: "create", title, description }),
      });
      setTitle("");
      setDescription("");
      success("活动已发布");
      router.refresh();
    } catch (err) {
      error(err instanceof Error ? err.message : "发布失败");
    }
  }

  async function rsvp(eventId: number, joined: boolean) {
    try {
      await apiFetch("/api/events", {
        method: "POST",
        body: JSON.stringify({ action: "rsvp", eventId }),
      });
      success(joined ? "已取消报名" : "报名成功");
      router.refresh();
    } catch (err) {
      error(err instanceof Error ? err.message : "报名失败");
    }
  }

  // 版主开关某场活动的报名（open <-> closed）
  async function setStatus(eventId: number, current: string) {
    const target = nextEventStatus(current);
    try {
      await apiFetch("/api/events", {
        method: "POST",
        body: JSON.stringify({ action: "set-status", eventId, status: target }),
      });
      success(target === "closed" ? "已关闭报名" : "已重新开放报名");
      router.refresh();
    } catch (err) {
      error(err instanceof Error ? err.message : "切换失败");
    }
  }

  async function vote(pollId: number, optionIndex: number, open: boolean) {
    if (!open) {
      error("投票已截止");
      return;
    }
    try {
      await apiFetch("/api/events", {
        method: "POST",
        body: JSON.stringify({ action: "vote", pollId, optionIndex }),
      });
      success("已投票");
      router.refresh();
    } catch (err) {
      error(err instanceof Error ? err.message : "投票失败");
    }
  }

  async function createPoll() {
    const options = pollOptions
      .split("|")
      .map((s) => s.trim())
      .filter(Boolean);
    if (!pollQuestion.trim() || options.length < 2) {
      error("请填写问题，并用 | 分隔至少两个选项");
      return;
    }
    try {
      await apiFetch("/api/events", {
        method: "POST",
        body: JSON.stringify({
          action: "poll-create",
          question: pollQuestion.trim(),
          options,
          endsAt: pollEndsAt || null,
          showLive: true,
        }),
      });
      setPollQuestion("");
      setPollOptions("");
      setPollEndsAt("");
      setPollOpen(false);
      success("投票已创建");
      router.refresh();
    } catch (err) {
      error(err instanceof Error ? err.message : "创建投票失败");
    }
  }

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      {canModerate ? (
        <form onSubmit={createEvent} className="panel grid gap-3 rounded-2xl p-5 lg:col-span-2">
          <input
            className="input"
            placeholder="活动/公告标题"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            required
          />
          <textarea
            className="input"
            placeholder="描述"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
          />
          <div className="flex flex-wrap gap-2">
            <button className="btn" type="submit">
              发布
            </button>
            <button
              className="btn btn-ghost"
              type="button"
              onClick={() => setPollOpen((v) => !v)}
            >
              {pollOpen ? "收起投票表单" : "新建投票"}
            </button>
          </div>
          {pollOpen ? (
            <div className="mt-2 grid gap-2 border-t border-[var(--line)] pt-4">
              <input
                className="input"
                placeholder="投票问题"
                value={pollQuestion}
                onChange={(e) => setPollQuestion(e.target.value)}
              />
              <input
                className="input"
                placeholder="选项，用 | 分隔，如：愿意|暂不考虑|再观望"
                value={pollOptions}
                onChange={(e) => setPollOptions(e.target.value)}
              />
              <input
                className="input"
                type="date"
                value={pollEndsAt}
                onChange={(e) => setPollEndsAt(e.target.value)}
                title="截止日期（当天仍可投）"
              />
              <p className="text-xs text-[var(--fog)]">
                截止日当天仍可投票；开启期实时出票，截止后保留最终结果。
              </p>
              <button
                className="btn"
                type="button"
                onClick={() => void createPoll()}
              >
                创建投票
              </button>
            </div>
          ) : null}
        </form>
      ) : null}

      <div className="space-y-3">
        <h2 className="stage-sec">报名</h2>
        {events.map((ev) => (
          <article key={ev.id} className="panel rounded-2xl p-5">
            <div className="text-xs text-[var(--amber)]">
              {ev.kind} · {ev.status}
            </div>
            <h2 className="mt-1 text-lg">{ev.title}</h2>
            <p className="mt-2 text-sm text-[var(--fog)]">{ev.description}</p>
            <div className="mt-3 flex items-center gap-3 text-sm">
              <span className="text-[var(--cyan)]">{ev.rsvp_count} 人报名</span>
              {ev.joined ? (
                <span className="text-xs text-[var(--amber)]">✓ 你已报名</span>
              ) : null}
              <button
                className="btn btn-ghost"
                type="button"
                disabled={!canToggleRsvp(ev.joined, ev.status)}
                onClick={() => void rsvp(ev.id, ev.joined)}
              >
                {rsvpButtonLabel(ev.joined, ev.status)}
              </button>
              {canModerate ? (
                <button
                  className="btn btn-ghost"
                  type="button"
                  onClick={() => void setStatus(ev.id, ev.status)}
                >
                  {toggleStatusLabel(ev.status)}
                </button>
              ) : null}
            </div>
          </article>
        ))}
        {events.length === 0 ? (
          <p className="text-sm text-[var(--fog)]">
            {emptyEventsHint(canModerate)}
          </p>
        ) : null}
      </div>

      <div className="space-y-3">
        <h2 className="stage-sec">投票</h2>
        {polls.map((p) => {
          const total = p.tallies.reduce((a, b) => a + b, 0);
          const mine = myVoteLabel(p.options, p.myVote);
          return (
            <article key={p.id} className="panel rounded-2xl p-5">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h3 className="text-[var(--ink)]">{p.question}</h3>
                <span className="text-xs text-[var(--fog)]">
                  {p.open
                    ? `进行中${p.endsAt ? ` · 截止 ${p.endsAt}` : ""}`
                    : `已截止${p.endsAt ? ` · ${p.endsAt}` : ""} · 最终结果`}
                </span>
              </div>
              <p className="mt-2 text-xs text-[var(--amber)]">
                {mine
                  ? `你投的是：${mine}${p.open ? "（截止前可改选）" : ""}`
                  : p.open
                    ? "你还没投票"
                    : "你未参与这场投票"}
              </p>
              <div className="mt-3 space-y-2">
                {p.options.map((opt, idx) => {
                  const n = p.tallies[idx] ?? 0;
                  const pct = total > 0 ? Math.round((n / total) * 100) : 0;
                  const isMine = p.myVote === idx;
                  return (
                    <button
                      key={`${p.id}-${opt}`}
                      type="button"
                      disabled={!p.open}
                      aria-pressed={isMine}
                      className={`relative flex w-full items-center justify-between overflow-hidden rounded-xl border px-3 py-2 text-left text-sm disabled:cursor-default disabled:opacity-90 ${
                        isMine
                          ? "border-[var(--cyan)]"
                          : "border-[var(--line)]"
                      }`}
                      onClick={() => void vote(p.id, idx, p.open)}
                    >
                      {p.showResults ? (
                        <span
                          className="pointer-events-none absolute inset-y-0 left-0 bg-[rgba(61,224,208,0.12)]"
                          style={{ width: `${pct}%` }}
                        />
                      ) : null}
                      <span className="relative z-10">
                        {isMine ? "✓ " : ""}
                        {opt}
                        {isMine ? "（我的选择）" : ""}
                      </span>
                      {p.showResults ? (
                        <span className="relative z-10 text-[var(--cyan)]">
                          {n} 票{total ? ` · ${pct}%` : ""}
                        </span>
                      ) : null}
                    </button>
                  );
                })}
              </div>
              {p.showResults ? (
                <p className="mt-2 text-xs text-[var(--fog)]">
                  合计 {total} 票
                  {p.open ? " · 投票后即时刷新结果" : ""}
                </p>
              ) : null}
            </article>
          );
        })}
        {polls.length === 0 ? (
          <p className="text-sm text-[var(--fog)]">
            {emptyPollsHint(canModerate)}
          </p>
        ) : null}
      </div>
    </div>
  );
}
