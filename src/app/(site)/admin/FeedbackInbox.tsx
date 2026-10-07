"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useToast } from "@/components/ToastProvider";
import { UserChip } from "@/components/UserChip";
import { apiFetch } from "@/lib/api-client";
import type { FeedbackRow, FeedbackStatus } from "@/lib/feedback-shared";

const FILTERS: { id: "pending" | "accepted" | "rejected" | "all"; label: string }[] = [
  { id: "pending", label: "待处理" },
  { id: "accepted", label: "已采纳" },
  { id: "rejected", label: "已拒绝" },
  { id: "all", label: "全部" },
];

const STATUS_LABEL: Record<FeedbackStatus, string> = {
  pending: "待处理",
  accepted: "已采纳",
  rejected: "已拒绝",
};

export function FeedbackInbox({ items }: { items: FeedbackRow[] }) {
  const router = useRouter();
  const { success, error } = useToast();
  const [filter, setFilter] = useState<(typeof FILTERS)[number]["id"]>("pending");
  const [picked, setPicked] = useState<number[]>([]);
  const [busy, setBusy] = useState(false);

  const visible = useMemo(
    () => (filter === "all" ? items : items.filter((item) => item.status === filter)),
    [filter, items],
  );
  const pendingVisible = visible.filter((item) => item.status === "pending");
  const allPicked =
    pendingVisible.length > 0 && pendingVisible.every((item) => picked.includes(item.id));

  function toggle(id: number) {
    setPicked((prev) => (prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]));
  }

  function toggleVisible() {
    setPicked((prev) => {
      if (allPicked) {
        const hide = new Set(pendingVisible.map((item) => item.id));
        return prev.filter((id) => !hide.has(id));
      }
      return [...new Set([...prev, ...pendingVisible.map((item) => item.id)])];
    });
  }

  async function decide(status: "accepted" | "rejected") {
    if (!picked.length) {
      error("请先勾选意见");
      return;
    }
    setBusy(true);
    try {
      await apiFetch("/api/feedback", {
        method: "PATCH",
        body: JSON.stringify({ ids: picked, status }),
      });
      success(status === "accepted" ? "已标记为采纳" : "已标记为拒绝");
      setPicked([]);
      router.refresh();
    } catch (err) {
      error(err instanceof Error ? err.message : "处理失败");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="panel rounded-2xl p-5">
      <h2 className="stage-sec">群友意见</h2>
      <p className="mt-2 text-sm text-[var(--fog)]">
        勾选待处理的条目，再标记采纳或拒绝。提出的人打开「提意见」就能看到结果。
      </p>
      <div className="mt-4 flex flex-wrap gap-2">
        {FILTERS.map((item) => (
          <button
            key={item.id}
            type="button"
            className={filter === item.id ? "btn" : "btn btn-ghost"}
            onClick={() => setFilter(item.id)}
          >
            {item.label}
          </button>
        ))}
      </div>
      {pendingVisible.length ? (
        <div className="mt-4 flex flex-wrap items-center gap-3">
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={allPicked} onChange={toggleVisible} />
            勾选本页待处理
          </label>
          <button className="btn" type="button" disabled={busy} onClick={() => void decide("accepted")}>
            采纳
          </button>
          <button className="btn btn-ghost" type="button" disabled={busy} onClick={() => void decide("rejected")}>
            拒绝
          </button>
        </div>
      ) : null}
      {visible.length ? (
        <ul className="mt-4 space-y-3">
          {visible.map((item) => (
            <li key={item.id} className="rounded-xl border border-[var(--line)] p-3">
              <div className="flex flex-wrap items-start gap-3">
                {item.status === "pending" ? (
                  <input
                    className="mt-1"
                    type="checkbox"
                    checked={picked.includes(item.id)}
                    aria-label={`勾选意见 ${item.id}`}
                    onChange={() => toggle(item.id)}
                  />
                ) : (
                  <span className="mt-0.5 rounded-full bg-[var(--bg-panel)] px-2 py-0.5 text-xs text-[var(--fog)]">
                    {STATUS_LABEL[item.status]}
                  </span>
                )}
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <UserChip
                      displayName={item.displayName}
                      avatarUrl={item.avatarUrl}
                      userId={item.userId}
                    />
                    <span className="text-xs text-[var(--fog)]">{item.createdAt.slice(0, 16)}</span>
                  </div>
                  <p className="mt-2 text-sm text-[var(--ink)]">{item.body}</p>
                  {item.note ? <p className="mt-1 text-sm text-[var(--fog)]">{item.note}</p> : null}
                </div>
              </div>
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-4 text-sm text-[var(--fog)]">这一栏还没有意见。</p>
      )}
    </section>
  );
}
