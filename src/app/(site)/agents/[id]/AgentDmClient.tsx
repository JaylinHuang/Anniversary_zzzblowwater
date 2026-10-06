"use client";

import {
  FormEvent,
  KeyboardEvent,
  useEffect,
  useRef,
  useState,
} from "react";
import Link from "next/link";
import { useToast } from "@/components/ToastProvider";
import { apiFetch } from "@/lib/api-client";

type Msg = {
  id?: number;
  role: "user" | "assistant";
  content: string;
  createdAt?: string;
};

type GroupLine = {
  id: number;
  sender: string;
  content: string;
  sentAt: string | null;
};

function clock(raw?: string) {
  if (!raw) return "";
  const matched = raw.match(/(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})/);
  if (!matched) return "";
  const today = new Date();
  const month = String(today.getMonth() + 1).padStart(2, "0");
  const day = String(today.getDate()).padStart(2, "0");
  const isToday =
    matched[1] === String(today.getFullYear()) &&
    matched[2] === month &&
    matched[3] === day;
  if (isToday) return `${matched[4]}:${matched[5]}`;
  return `${Number(matched[2])}月${Number(matched[3])}日 ${matched[4]}:${matched[5]}`;
}

function gapMinutes(prev?: string, next?: string) {
  if (!prev || !next) return true;
  const a = Date.parse(prev.includes("T") ? prev : prev.replace(" ", "T"));
  const b = Date.parse(next.includes("T") ? next : next.replace(" ", "T"));
  if (Number.isNaN(a) || Number.isNaN(b)) return true;
  return Math.abs(b - a) >= 5 * 60 * 1000;
}

function Face({
  name,
  src,
}: {
  name: string;
  src?: string | null;
}) {
  if (src) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img className="qq-face" src={src} alt="" />
    );
  }
  return <span className="qq-face qq-face-fallback">{name.slice(0, 1)}</span>;
}

export function AgentDmClient({
  agentId,
  agentName,
  agentAvatar,
  styleCaption,
  userName,
  userAvatar,
  initialSessionId,
  initialMessages,
  initialQuota,
  groupLog,
}: {
  agentId: number;
  agentName: string;
  agentAvatar: string | null;
  styleCaption: string;
  userName: string;
  userAvatar: string | null;
  initialSessionId: number;
  initialMessages: Msg[];
  initialQuota: { used: number; limit: number };
  groupLog: GroupLine[];
}) {
  const { error: toastError, success } = useToast();
  const [sessionId, setSessionId] = useState(initialSessionId);
  const [messages, setMessages] = useState<Msg[]>(initialMessages);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [quota, setQuota] = useState(initialQuota);
  const [showLog, setShowLog] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const sending = useRef(false);
  const quotaFull = quota.used >= quota.limit;

  useEffect(() => {
    endRef.current?.scrollIntoView({ block: "end" });
  }, [messages, busy]);

  async function sendText(text: string) {
    if (!text || sending.current || quotaFull) return;
    sending.current = true;
    setInput("");
    const optimistic: Msg = {
      role: "user",
      content: text,
      createdAt: new Date().toISOString(),
    };
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
        {
          role: "assistant",
          content: data.reply,
          createdAt: new Date().toISOString(),
        },
      ]);
    } catch (err) {
      setMessages((prev) => prev.filter((m) => m !== optimistic));
      setInput((cur) => cur || text);
      toastError(err instanceof Error ? err.message : "发送失败");
    } finally {
      sending.current = false;
      setBusy(false);
      inputRef.current?.focus();
    }
  }

  function send(e: FormEvent) {
    e.preventDefault();
    void sendText(input.trim());
  }

  function onKey(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      void sendText(input.trim());
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
    <div className="qq-window">
      <header className="qq-bar">
        <Link href="/agents" className="qq-back" aria-label="返回群友列表">
          返回
        </Link>
        <Face name={agentName} src={agentAvatar} />
        <div className="qq-bar-text">
          <div className="qq-bar-name">{agentName}</div>
          <div className="qq-bar-sub">
            分身模拟，不是本人在线
            {styleCaption ? ` · ${styleCaption}` : ""}
            {` · 今日 ${quota.used}/${quota.limit}`}
          </div>
        </div>
        <div className="qq-bar-actions">
          {groupLog.length ? (
            <button
              className="btn btn-ghost"
              type="button"
              onClick={() => setShowLog((open) => !open)}
            >
              {showLog ? "收起记录" : "群记录"}
            </button>
          ) : null}
          <button
            className="btn btn-ghost"
            type="button"
            disabled={busy}
            onClick={newSession}
          >
            新会话
          </button>
        </div>
      </header>

      <div className="qq-body">
        <div className="qq-thread" aria-live="polite">
          {messages.length === 0 ? (
            <p className="qq-empty">
              和 {agentName} 打个招呼。记录只你能看，会话 #{sessionId}
            </p>
          ) : (
            messages.map((message, index) => {
              const mine = message.role === "user";
              const prev = messages[index - 1];
              const showClock =
                index === 0 || gapMinutes(prev?.createdAt, message.createdAt);
              return (
                <div key={message.id ?? `m-${index}`}>
                  {showClock && clock(message.createdAt) ? (
                    <div className="qq-time">{clock(message.createdAt)}</div>
                  ) : null}
                  <div className={mine ? "qq-row is-mine" : "qq-row"}>
                    <Face
                      name={mine ? userName : agentName}
                      src={mine ? userAvatar : agentAvatar}
                    />
                    <div className={mine ? "qq-bubble is-mine" : "qq-bubble"}>
                      {message.content}
                    </div>
                  </div>
                </div>
              );
            })
          )}
          {busy ? (
            <div className="qq-row">
              <Face name={agentName} src={agentAvatar} />
              <div className="qq-bubble qq-typing" aria-label="正在输入">
                <span />
                <span />
                <span />
              </div>
            </div>
          ) : null}
          <div ref={endRef} />
        </div>

        {showLog ? (
          <aside className="qq-log">
            <p className="qq-log-title">近期群聊</p>
            <ul>
              {groupLog.map((line) => (
                <li key={line.id}>
                  <span>
                    {line.sentAt || "?"} · {line.sender}
                  </span>
                  <p>{line.content}</p>
                </li>
              ))}
            </ul>
          </aside>
        ) : null}
      </div>

      <form className="qq-compose" onSubmit={send}>
        <textarea
          ref={inputRef}
          className="input qq-input"
          value={input}
          rows={2}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={onKey}
          placeholder={
            quotaFull ? "今天的额度用完了，明天再来" : `对 ${agentName} 说…`
          }
          disabled={quotaFull}
        />
        <button className="btn" type="submit" disabled={busy || quotaFull || !input.trim()}>
          发送
        </button>
      </form>
    </div>
  );
}
