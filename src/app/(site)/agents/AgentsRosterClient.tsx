"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import { useToast } from "@/components/ToastProvider";
import { apiFetch } from "@/lib/api-client";

export function AgentsRosterClient({
  groupName,
  llmConfigured,
  model,
  canManage,
  dmQuota,
}: {
  groupName: string;
  llmConfigured: boolean;
  model: string | null;
  canManage: boolean;
  dmQuota: { used: number; limit: number; remaining: number };
}) {
  const router = useRouter();
  const { success, error } = useToast();
  const [busy, setBusy] = useState(false);
  const [displayName, setDisplayName] = useState("");
  const [qq, setQq] = useState("");
  const [file, setFile] = useState<File | null>(null);

  async function createAgent(e: FormEvent) {
    e.preventDefault();
    if (!canManage || busy) return;
    setBusy(true);
    try {
      const form = new FormData();
      form.set("action", "create");
      form.set("displayName", displayName);
      form.set("qq", qq);
      if (file) form.set("illustration", file);
      const data = await apiFetch<{ id: number; qq: string }>("/api/agents", {
        method: "POST",
        body: form,
      });
      success(`已创建 Agent（QQ ${data.qq}）`);
      setDisplayName("");
      setQq("");
      setFile(null);
      router.refresh();
    } catch (err) {
      error(err instanceof Error ? err.message : "创建失败");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="panel mt-6 space-y-4 rounded-2xl p-5 text-sm">
      <div>
        群：<span className="text-[var(--cyan)]">{groupName}</span>
        {" · "}
        大模型：
        <span
          className={
            llmConfigured ? "text-[var(--cyan)]" : "text-[var(--danger)]"
          }
        >
          {llmConfigured ? model : "未配置"}
        </span>
        {" · "}
        今日额度：
        <span className="text-[var(--amber)]">
          {dmQuota.used}/{dmQuota.limit}
        </span>
      </div>

      {canManage ? (
        <>
          <p className="text-[var(--fog)]">
            设定显示名与插画，绑定 QQ。OneBot / 归档会持续收录该 QQ 群聊。
          </p>
          <form onSubmit={createAgent} className="grid gap-3 md:grid-cols-2">
            <input
              className="input"
              placeholder="显示名（站内名称）"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              required
              maxLength={24}
              disabled={busy}
            />
            <input
              className="input"
              placeholder="绑定 QQ 号"
              value={qq}
              onChange={(e) => setQq(e.target.value)}
              required
              inputMode="numeric"
              disabled={busy}
            />
            <input
              className="input md:col-span-2"
              type="file"
              accept="image/*"
              onChange={(e) => setFile(e.target.files?.[0] || null)}
              disabled={busy}
            />
            <button className="btn md:col-span-2" type="submit" disabled={busy}>
              {busy ? "处理中…" : "添加群友 Agent"}
            </button>
          </form>
        </>
      ) : (
        <p className="text-[var(--fog)]">
          选一位分身点进去就能聊。今天还能聊 {dmQuota.remaining} 轮。
        </p>
      )}
    </div>
  );
}

export function AgentAdminActions({
  id,
  name,
  canManage,
}: {
  id: number;
  name: string;
  canManage: boolean;
}) {
  const router = useRouter();
  const { success, error, confirm } = useToast();
  const [busy, setBusy] = useState(false);

  if (!canManage) return null;

  async function rebuild() {
    setBusy(true);
    try {
      const data = await apiFetch<{ sourceMsgCount: number }>("/api/agents", {
        method: "POST",
        body: JSON.stringify({ action: "rebuild-persona", id }),
      });
      success(`已重炼人设 · 语料 ${data.sourceMsgCount} 条`);
      router.refresh();
    } catch (err) {
      error(err instanceof Error ? err.message : "重炼失败");
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    const ok = await confirm({
      title: "停用 Agent",
      message: `确定停用「${name}」？单聊历史会保留，可再绑同 QQ 恢复。`,
    });
    if (!ok) return;
    setBusy(true);
    try {
      await apiFetch("/api/agents", {
        method: "POST",
        body: JSON.stringify({ action: "disable", id }),
      });
      success("已停用");
      router.refresh();
    } catch (err) {
      error(err instanceof Error ? err.message : "停用失败");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mt-3 flex flex-wrap gap-2">
      <button
        type="button"
        className="btn btn-ghost"
        disabled={busy}
        onClick={() => void rebuild()}
      >
        重炼人设
      </button>
      <button
        type="button"
        className="btn btn-ghost"
        disabled={busy}
        onClick={() => void remove()}
      >
        停用
      </button>
    </div>
  );
}
