"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import { useToast } from "@/components/ToastProvider";
import { apiFetch } from "@/lib/api-client";

type Msg = {
  id: number;
  sender: string;
  sent_at: string | null;
  content: string;
  is_quote: number;
};

type Batch = {
  id: number;
  filename: string;
  message_count: number;
  status: string;
  time_start: string | null;
  time_end: string | null;
};

export function ArchiveClient({
  initialMessages,
  batches,
  canImport,
  canQuote,
  initialQuery,
  topSenders = [],
}: {
  initialMessages: Msg[];
  batches: Batch[];
  canImport: boolean;
  canQuote: boolean;
  initialQuery: string;
  topSenders?: string[];
}) {
  const router = useRouter();
  const { success, error, confirm } = useToast();
  const [q, setQ] = useState(initialQuery);
  const [text, setText] = useState("");
  const [preview, setPreview] = useState("");
  const [busy, setBusy] = useState(false);

  async function search(e: FormEvent) {
    e.preventDefault();
    router.push(`/archive?q=${encodeURIComponent(q)}`);
  }

  async function doPreview() {
    setBusy(true);
    try {
      const data = await apiFetch<{
        preview: { count: number; timeStart?: string; timeEnd?: string };
      }>("/api/archive", {
        method: "POST",
        body: JSON.stringify({ action: "preview", text }),
      });
      setPreview(
        `预览：${data.preview.count} 条，${data.preview.timeStart || "?"} ~ ${data.preview.timeEnd || "?"}`,
      );
      success("预览完成");
    } catch (e) {
      const msg = e instanceof Error ? e.message : "预览失败";
      setPreview(msg);
      error(msg);
    } finally {
      setBusy(false);
    }
  }

  async function doCommit() {
    const ok = await confirm({
      title: "确认入库",
      message: "将把当前粘贴内容写入归档，确认继续？",
    });
    if (!ok) return;
    setBusy(true);
    try {
      const data = await apiFetch<{ count: number }>("/api/archive", {
        method: "POST",
        body: JSON.stringify({
          action: "commit",
          text,
          filename: "qq-export.txt",
        }),
      });
      setPreview(`已导入 ${data.count} 条`);
      success(`已导入 ${data.count} 条`);
      router.refresh();
    } catch (e) {
      const msg = e instanceof Error ? e.message : "导入失败";
      setPreview(msg);
      error(msg);
    } finally {
      setBusy(false);
    }
  }

  async function rollback(batchId: number) {
    const ok = await confirm({
      title: "撤销批次",
      message: `确定撤销批次 #${batchId}？相关消息将从归档中移除。`,
    });
    if (!ok) return;
    try {
      await apiFetch("/api/archive", {
        method: "POST",
        body: JSON.stringify({ action: "rollback", batchId }),
      });
      success("批次已撤销");
      router.refresh();
    } catch (e) {
      error(e instanceof Error ? e.message : "撤销失败");
    }
  }

  async function toggleQuote(id: number, on: boolean) {
    try {
      await apiFetch("/api/archive", {
        method: "POST",
        body: JSON.stringify({ action: "quote", messageId: id, on }),
      });
      success(on ? "已标为金句" : "已取消金句");
      router.refresh();
    } catch (e) {
      error(e instanceof Error ? e.message : "操作失败");
    }
  }

  return (
    <div className="mt-6 space-y-6">
      <form onSubmit={search} className="flex gap-2">
        <input
          className="input"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="搜索内容或发送者"
        />
        <button className="btn" type="submit">
          检索
        </button>
      </form>
      {topSenders.length ? (
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            className="btn btn-ghost"
            onClick={() => router.push("/archive")}
          >
            全部
          </button>
          {topSenders.map((name) => (
            <button
              key={name}
              type="button"
              className="btn btn-ghost"
              onClick={() =>
                router.push(`/archive?q=${encodeURIComponent(name)}`)
              }
            >
              {name}
            </button>
          ))}
        </div>
      ) : null}

      {canImport ? (
        <div className="panel rounded-2xl p-5">
          <h2 className="text-lg text-[var(--amber)]">管理员导入</h2>
          <textarea
            className="input mt-3 min-h-40 font-mono text-xs"
            placeholder="粘贴 QQ 导出的 TXT…"
            value={text}
            onChange={(e) => setText(e.target.value)}
          />
          <div className="mt-3 flex flex-wrap gap-2">
            <button
              className="btn btn-ghost"
              type="button"
              disabled={busy}
              onClick={() => void doPreview()}
            >
              预览校验
            </button>
            <button
              className="btn"
              type="button"
              disabled={busy}
              onClick={() => void doCommit()}
            >
              确认入库
            </button>
          </div>
          {preview ? (
            <p className="mt-2 text-sm text-[var(--cyan)]">{preview}</p>
          ) : null}
          <ul className="mt-4 space-y-2 text-sm text-[var(--fog)]">
            {batches.map((b) => (
              <li key={b.id} className="flex flex-wrap items-center gap-2">
                <span>
                  #{b.id} {b.filename} · {b.message_count} 条 · {b.status}
                </span>
                {b.status === "active" ? (
                  <button
                    className="btn btn-ghost"
                    type="button"
                    onClick={() => void rollback(b.id)}
                  >
                    撤销批次
                  </button>
                ) : null}
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      <div className="space-y-3">
        {initialMessages.map((m) => (
          <article key={m.id} className="panel rounded-xl p-4">
            <div className="flex items-center justify-between gap-2 text-xs text-[var(--fog)]">
              <span>
                {m.sender} · {m.sent_at || "未知时间"}
              </span>
              {canQuote ? (
                <button
                  type="button"
                  className="text-[var(--amber)]"
                  onClick={() => void toggleQuote(m.id, !m.is_quote)}
                >
                  {m.is_quote ? "取消金句" : "标为金句"}
                </button>
              ) : m.is_quote ? (
                <span className="text-[var(--amber)]">金句</span>
              ) : null}
            </div>
            <p className="mt-2 whitespace-pre-wrap text-sm">{m.content}</p>
          </article>
        ))}
        {initialMessages.length === 0 ? (
          <p className="text-sm text-[var(--fog)]">
            暂无消息，请管理员导入。
          </p>
        ) : null}
      </div>
    </div>
  );
}
