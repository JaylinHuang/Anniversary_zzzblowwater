"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import { useToast } from "@/components/ToastProvider";
import { apiFetch } from "@/lib/api-client";

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
  }[];
  polls: {
    id: number;
    question: string;
    options: string[];
    showLive: boolean;
    tallies: number[];
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

  async function rsvp(eventId: number) {
    try {
      await apiFetch("/api/events", {
        method: "POST",
        body: JSON.stringify({ action: "rsvp", eventId }),
      });
      success("报名状态已更新");
      router.refresh();
    } catch (err) {
      error(err instanceof Error ? err.message : "报名失败");
    }
  }

  async function vote(pollId: number, optionIndex: number) {
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
        }),
      });
      setPollQuestion("");
      setPollOptions("");
      setPollOpen(false);
      success("投票已创建");
      router.refresh();
    } catch (err) {
      error(err instanceof Error ? err.message : "创建投票失败");
    }
  }

  return (
    <div className="mt-6 space-y-8">
      {canModerate ? (
        <form onSubmit={createEvent} className="panel grid gap-3 rounded-2xl p-5">
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
                placeholder="选项，用 | 分隔，如：周五|周六|周日"
                value={pollOptions}
                onChange={(e) => setPollOptions(e.target.value)}
              />
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
        {events.map((ev) => (
          <article key={ev.id} className="panel rounded-2xl p-5">
            <div className="text-xs text-[var(--amber)]">
              {ev.kind} · {ev.status}
            </div>
            <h2 className="mt-1 text-lg">{ev.title}</h2>
            <p className="mt-2 text-sm text-[var(--fog)]">{ev.description}</p>
            <div className="mt-3 flex items-center gap-3 text-sm">
              <span className="text-[var(--cyan)]">{ev.rsvp_count} 人报名</span>
              <button
                className="btn btn-ghost"
                type="button"
                onClick={() => void rsvp(ev.id)}
              >
                报名/取消
              </button>
            </div>
          </article>
        ))}
        {events.length === 0 ? (
          <p className="text-sm text-[var(--fog)]">还没有活动——等版主发第一条吧。</p>
        ) : null}
      </div>

      <div className="space-y-3">
        {polls.map((p) => (
          <article key={p.id} className="panel rounded-2xl p-5">
            <h3>{p.question}</h3>
            <div className="mt-3 space-y-2">
              {p.options.map((opt, idx) => (
                <button
                  key={opt}
                  type="button"
                  className="flex w-full items-center justify-between rounded-xl border border-[var(--line)] px-3 py-2 text-left text-sm"
                  onClick={() => void vote(p.id, idx)}
                >
                  <span>{opt}</span>
                  {p.showLive ? (
                    <span className="text-[var(--cyan)]">{p.tallies[idx]}</span>
                  ) : null}
                </button>
              ))}
            </div>
          </article>
        ))}
        {polls.length === 0 ? (
          <p className="text-sm text-[var(--fog)]">暂无投票。</p>
        ) : null}
      </div>
    </div>
  );
}
