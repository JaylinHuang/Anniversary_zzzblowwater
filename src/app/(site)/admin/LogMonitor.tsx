"use client";

import { useCallback, useEffect, useState } from "react";
import { apiFetch } from "@/lib/api-client";

type LogLevel = "info" | "warn" | "error";

type LogEntry = {
  at: string;
  level: LogLevel;
  scope: string;
  message: string;
  rssMb: number;
  heapMb: number;
};

type LogSnapshot = {
  entries: LogEntry[];
  rssMb: number;
  heapMb: number;
  uptimeSec: number;
};

const LEVEL_LABEL: Record<LogLevel, string> = {
  info: "信息",
  warn: "注意",
  error: "错误",
};

function formatUptime(sec: number): string {
  const hours = Math.floor(sec / 3600);
  const minutes = Math.floor((sec % 3600) / 60);
  if (hours > 0) return `${hours} 小时 ${minutes} 分`;
  return `${minutes} 分`;
}

/** 管理后台里的运行情况。十五秒刷新一次，失败就留着上一屏 */
export function LogMonitor() {
  const [snap, setSnap] = useState<LogSnapshot | null>(null);
  const [hint, setHint] = useState("");

  const load = useCallback(async () => {
    try {
      const data = await apiFetch<LogSnapshot>("/api/admin/logs");
      setSnap(data);
      setHint("");
    } catch (e) {
      setHint(e instanceof Error ? e.message : "日志没读到");
    }
  }, []);

  useEffect(() => {
    void load();
    const timer = window.setInterval(() => void load(), 15_000);
    return () => window.clearInterval(timer);
  }, [load]);

  return (
    <section className="panel rounded-2xl p-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="stage-sec">运行日志</h2>
        <button className="btn btn-ghost" type="button" onClick={() => void load()}>
          刷新
        </button>
      </div>
      <p className="mt-2 text-sm text-[var(--fog)]">
        进程内存、私聊失败和启动记录。聊天正文和 QQ 不会写进来。进程重启后，挂掉前的记录还在。
      </p>
      {snap ? (
        <p className="mt-3 text-sm text-[var(--ink)]">
          已运行 {formatUptime(snap.uptimeSec)} · 内存 {snap.rssMb} MB · 堆 {snap.heapMb} MB
        </p>
      ) : null}
      {hint ? <p className="mt-3 text-sm text-[var(--amber)]">{hint}</p> : null}
      {snap && snap.entries.length === 0 ? (
        <p className="mt-4 text-sm text-[var(--fog)]">还没有记录。过一会儿会看到进程心跳。</p>
      ) : null}
      {snap && snap.entries.length > 0 ? (
        <ul className="mt-4 max-h-80 space-y-2 overflow-y-auto text-sm">
          {snap.entries.map((entry, index) => (
            <li
              key={`${entry.at}-${entry.scope}-${index}`}
              className="rounded-xl border border-[var(--line)] px-3 py-2"
            >
              <div className="flex flex-wrap items-center gap-2 text-xs text-[var(--fog)]">
                <span>{entry.at}</span>
                <span
                  className={
                    entry.level === "error"
                      ? "text-[var(--amber)]"
                      : entry.level === "warn"
                        ? "text-[var(--cyan)]"
                        : ""
                  }
                >
                  {LEVEL_LABEL[entry.level]}
                </span>
                <span>{entry.scope}</span>
                <span>
                  {entry.rssMb} MB
                </span>
              </div>
              <p className="mt-1 text-[var(--ink)]">{entry.message}</p>
            </li>
          ))}
        </ul>
      ) : null}
    </section>
  );
}
