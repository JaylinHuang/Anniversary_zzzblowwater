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
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState("");
  const [busy, setBusy] = useState(false);

  async function search(e: FormEvent) {
    e.preventDefault();
    router.push(`/archive?q=${encodeURIComponent(q)}`);
  }

  async function doPreview() {
    if (!file) {
      error("请选择 zzz-archive JSON 文件");
      return;
    }
    setBusy(true);
    try {
      const fd = new FormData();
      fd.append("action", "preview");
      fd.append("file", file);
      const data: {
        preview: {
          count: number;
          timeStart?: string | null;
          timeEnd?: string | null;
          format?: string;
        };
        errors?: string[];
      } = await apiFetch("/api/archive", { method: "POST", body: fd });
      const errHint = data.errors?.length
        ? ` · ${data.errors.slice(0, 2).join("；")}`
        : "";
      setPreview(
        `预览：${data.preview.count} 条（json），${data.preview.timeStart || "?"} ~ ${data.preview.timeEnd || "?"}${errHint}`,
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
    if (!file) {
      error("请选择 zzz-archive JSON 文件");
      return;
    }
    const ok = await confirm({
      title: "确认入库",
      message: `将导入「${file.name}」。大文件可能需要数分钟，请勿关闭页面。`,
    });
    if (!ok) return;
    setBusy(true);
    try {
      const fd = new FormData();
      fd.append("action", "commit");
      fd.append("file", file);
      const data: { count: number } = await apiFetch("/api/archive", {
        method: "POST",
        body: fd,
      });
      setPreview(`已导入 ${data.count} 条`);
      success(`已导入 ${data.count} 条`);
      setFile(null);
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

  async function restore(batchId: number) {
    try {
      await apiFetch("/api/archive", {
        method: "POST",
        body: JSON.stringify({ action: "restore", batchId }),
      });
      success("批次已恢复");
      router.refresh();
    } catch (e) {
      error(e instanceof Error ? e.message : "恢复失败");
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
      <h2 className="stage-sec">检索</h2>
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
          <h2 className="stage-sec">管理员导入</h2>
          <p className="mt-1 text-xs text-[var(--fog)]">
            上传 zzz-archive JSON（文本与回复；转换时已去掉撤回和系统消息）。
          </p>
          <label className="mt-3 block text-sm text-[var(--fog)]">
            上传 JSON
            <input
              className="input mt-2"
              type="file"
              accept=".json,application/json"
              disabled={busy}
              onChange={(e) => setFile(e.target.files?.[0] || null)}
            />
          </label>
          {file ? (
            <p className="mt-2 text-xs text-[var(--cyan)]">
              已选：{file.name}（{(file.size / 1024 / 1024).toFixed(1)} MB）
            </p>
          ) : null}
          <div className="mt-3 flex flex-wrap gap-2">
            <button
              className="btn btn-ghost"
              type="button"
              disabled={busy}
              onClick={() => void doPreview()}
            >
              {busy ? "处理中…" : "预览校验"}
            </button>
            <button
              className="btn"
              type="button"
              disabled={busy}
              onClick={() => void doCommit()}
            >
              确认入库
            </button>
            {file ? (
              <button
                className="btn btn-ghost"
                type="button"
                disabled={busy}
                onClick={() => setFile(null)}
              >
                清除文件
              </button>
            ) : null}
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
                {b.status === "rolled_back" ? (
                  <button
                    className="btn"
                    type="button"
                    onClick={() => void restore(b.id)}
                  >
                    恢复批次
                  </button>
                ) : null}
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      <h2 className="stage-sec">检索结果</h2>
      <div className="grid gap-3 md:grid-cols-2">
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
