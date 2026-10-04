"use client";

import { FormEvent, useState } from "react";
import Link from "next/link";
import { useToast } from "@/components/ToastProvider";
import { apiFetch } from "@/lib/api-client";

type Msg = { id?: number; role: "user" | "assistant"; content: string };

export function AgentDmClient({
  agentId,
  agentName,
  groupName,
  initialSessionId,
  initialMessages,
  initialQuota,
}: {
  agentId: number;
  agentName: string;
  groupName: string;
  initialSessionId: number;
  initialMessages: Msg[];
  initialQuota: { used: number; limit: number };
}) {
  const { error: toastError, success } = useToast();
  const [sessionId, setSessionId] = useState(initialSessionId);
  const [messages, setMessages] = useState<Msg[]>(initialMessages);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [quota, setQuota] = useState(initialQuota);
  const quotaLabel = `今日额度 ${quota.used}/${quota.limit}`;
  const quotaFull = quota.used >= quota.limit;

  async function send(e: FormEvent) {
    e.preventDefault();
    const text = input.trim();
    if (!text || busy || quotaFull) return;
    setInput("");
    // 乐观追加的这一句；失败时按引用精确撤回
    const optimistic: Msg = { role: "user", content: text };
    setMessages((prev) => [...prev, optimistic]);
    setBusy(true);
    try {
      const data = await apiFetch<{
        sessionId?: number;
        reply: string;
        quota?: { used: number; limit: number };
      }>("/api/agents", {
        method: "POST",
        body: JSON.stringify({ action: "dm", agentId, content: text }),
      });
      if (data.sessionId) setSessionId(data.sessionId);
      if (data.quota) {
        setQuota({ used: data.quota.used, limit: data.quota.limit });
      }
      setMessages((prev) => [
        ...prev,
        { role: "assistant", content: data.reply },
      ]);
    } catch (err) {
      // 发送失败：撤回刚追加的那句，并把文字放回输入框方便重试
      setMessages((prev) => prev.filter((m) => m !== optimistic));
      setInput((cur) => cur || text);
      toastError(err instanceof Error ? err.message : "发送失败");
    } finally {
      setBusy(false);
    }
  }

  async function newSession() {
    setBusy(true);
    try {
      const data = await apiFetch<{ sessionId: number }>("/api/agents", {
        method: "POST",
        body: JSON.stringify({ action: "new-session", agentId }),
      });
      setSessionId(data.sessionId);
      setMessages([]);
      success("已开启新会话");
    } catch (err) {
      toastError(err instanceof Error ? err.message : "无法新开会话");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mt-6">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2 text-xs text-[var(--fog)]">
        <span>
          会话 #{sessionId} · 仅你可见 · 不进「{groupName}」群归档
          {` · ${quotaLabel}`}
          {quotaFull ? "（已用完，明天再来）" : ""}
        </span>
        <div className="flex gap-2">
          <Link href="/agents" className="btn btn-ghost">
            返回列表
          </Link>
          <button
            className="btn btn-ghost"
            type="button"
            disabled={busy}
            onClick={newSession}
          >
            新会话
          </button>
        </div>
      </div>

      <div className="panel max-h-[520px] space-y-3 overflow-y-auto rounded-2xl p-5">
        {messages.length === 0 ? (
          <p className="text-sm text-[var(--fog)]">
            和「{agentName}」打个招呼吧。人设来自 {groupName} 语料；对你的印象会私有漂移。
          </p>
        ) : (
          messages.map((m, i) => (
            <div key={i} className="text-sm">
              <div
                className={
                  m.role === "user" ? "text-[var(--cyan)]" : "text-[var(--amber)]"
                }
              >
                {m.role === "user" ? "你" : agentName}
              </div>
              <p className="mt-1 whitespace-pre-wrap">{m.content}</p>
            </div>
          ))
        )}
      </div>

      <form onSubmit={send} className="mt-4 flex gap-2">
        <input
          className="input"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder={`对 ${agentName} 说…`}
          disabled={busy || quotaFull}
        />
        <button className="btn" type="submit" disabled={busy || quotaFull}>
          {busy ? "…" : "发送"}
        </button>
      </form>
    </div>
  );
}
