"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import { useToast } from "@/components/ToastProvider";
import { apiFetch } from "@/lib/api-client";
import {
  FEEDBACK_BATCH_MAX,
  FEEDBACK_BODY_MAX,
  FEEDBACK_NOTE_MAX,
  type FeedbackRow,
  type FeedbackStatus,
} from "@/lib/feedback";

const STATUS_LABEL: Record<FeedbackStatus, string> = {
  pending: "待处理",
  accepted: "已采纳",
  rejected: "已拒绝",
};

function statusClass(status: FeedbackStatus) {
  if (status === "accepted") return "bg-[var(--cyan)] text-[var(--cyan-ink)]";
  if (status === "rejected") return "bg-[var(--amber)] text-[#2a1408]";
  return "bg-[var(--bg-panel)] text-[var(--fog)]";
}

export function FeedbackClient({ items }: { items: FeedbackRow[] }) {
  const router = useRouter();
  const { success, error } = useToast();
  const [rows, setRows] = useState([{ body: "", note: "" }]);
  const [busy, setBusy] = useState(false);

  function update(index: number, key: "body" | "note", value: string) {
    setRows((prev) => prev.map((row, i) => (i === index ? { ...row, [key]: value } : row)));
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      const data = await apiFetch<{ count: number }>("/api/feedback", {
        method: "POST",
        body: JSON.stringify({ items: rows }),
      });
      success(`已提交 ${data.count} 条意见`);
      setRows([{ body: "", note: "" }]);
      router.refresh();
    } catch (err) {
      error(err instanceof Error ? err.message : "提交失败");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mt-6 space-y-6">
      <form className="panel rounded-2xl p-5" onSubmit={submit}>
        <h2 className="stage-sec">写给管理员</h2>
        <p className="mt-2 text-sm text-[var(--fog)]">
          一次可以交多条。每条先写意见，需要时再补一段说明。提交后能在下面看到是否被采纳。
        </p>
        <div className="mt-4 space-y-4">
          {rows.map((row, index) => (
            <div key={index} className="rounded-xl border border-[var(--line)] p-3">
              <div className="mb-2 flex items-center justify-between gap-2">
                <span className="eyebrow text-[0.62rem]">意见 {index + 1}</span>
                {rows.length > 1 ? (
                  <button
                    type="button"
                    className="btn btn-ghost"
                    onClick={() => setRows((prev) => prev.filter((_, i) => i !== index))}
                  >
                    移出
                  </button>
                ) : null}
              </div>
              <label className="block text-sm">
                意见
                <textarea
                  className="input mt-1 min-h-20 w-full"
                  maxLength={FEEDBACK_BODY_MAX}
                  value={row.body}
                  placeholder="想让站点改什么，或哪里不顺手"
                  onChange={(e) => update(index, "body", e.target.value)}
                />
              </label>
              <label className="mt-3 block text-sm">
                补充说明
                <textarea
                  className="input mt-1 min-h-16 w-full"
                  maxLength={FEEDBACK_NOTE_MAX}
                  value={row.note}
                  placeholder="可选。背景、例子，或你希望怎么改"
                  onChange={(e) => update(index, "note", e.target.value)}
                />
              </label>
            </div>
          ))}
        </div>
        <div className="mt-4 flex flex-wrap gap-3">
          <button
            type="button"
            className="btn btn-ghost"
            disabled={rows.length >= FEEDBACK_BATCH_MAX}
            onClick={() => setRows((prev) => [...prev, { body: "", note: "" }])}
          >
            再加一条
          </button>
          <button className="btn" type="submit" disabled={busy}>
            {busy ? "提交中…" : "提交这一批"}
          </button>
        </div>
      </form>

      <section className="panel rounded-2xl p-5">
        <h2 className="stage-sec">我提交的</h2>
        {items.length ? (
          <ul className="mt-4 space-y-3">
            {items.map((item) => (
              <li key={item.id} className="rounded-xl border border-[var(--line)] p-3">
                <div className="flex flex-wrap items-center gap-2">
                  <span className={`rounded-full px-2 py-0.5 text-xs ${statusClass(item.status)}`}>
                    {STATUS_LABEL[item.status]}
                  </span>
                  <span className="text-xs text-[var(--fog)]">{item.createdAt.slice(0, 16)}</span>
                </div>
                <p className="mt-2 text-sm text-[var(--ink)]">{item.body}</p>
                {item.note ? (
                  <p className="mt-1 text-sm text-[var(--fog)]">{item.note}</p>
                ) : null}
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-3 text-sm text-[var(--fog)]">还没有提交过意见。</p>
        )}
      </section>
    </div>
  );
}
