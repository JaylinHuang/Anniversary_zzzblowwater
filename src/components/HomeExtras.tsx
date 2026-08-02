"use client";

import { useCallback, useEffect, useState } from "react";
import { useToast } from "@/components/ToastProvider";
import { apiFetch } from "@/lib/api-client";

type CheckinState = {
  today: string;
  checkedIn: boolean;
  stamp: string;
  streak: number;
  total: number;
  todayTotal: number;
};

type Echo = {
  content: string;
  sender: string;
  label: string;
  sentAt: string | null;
};

type WeekdayItem = {
  content: string;
  sender: string;
  sentAt: string | null;
};

export function HomeExtras({
  quote,
  spotlight,
}: {
  quote: {
    content: string;
    sender: string;
    isCurated: boolean;
  } | null;
  spotlight: {
    displayName: string;
    textCount: number;
    sample: string | null;
  } | null;
}) {
  const { success, error } = useToast();
  const [checkin, setCheckin] = useState<CheckinState | null>(null);
  const [echo, setEcho] = useState<Echo | null>(null);
  const [weekdayItems, setWeekdayItems] = useState<WeekdayItem[]>([]);
  const [busy, setBusy] = useState(false);
  const [echoSalt, setEchoSalt] = useState(0);

  const load = useCallback(async () => {
    try {
      const data = await apiFetch<CheckinState>("/api/checkin");
      setCheckin(data);
    } catch {
      /* 静默 */
    }
  }, []);

  const loadEcho = useCallback(async (salt: number) => {
    try {
      const data = await apiFetch<{ echo: Echo }>(`/api/memory-echo?salt=${salt}`);
      setEcho(data.echo);
    } catch {
      /* 静默 */
    }
  }, []);

  useEffect(() => {
    void load();
    void loadEcho(0);
    void (async () => {
      try {
        const data = await apiFetch<{ items: WeekdayItem[] }>("/api/weekday-echo");
        setWeekdayItems(data.items || []);
      } catch {
        /* 静默 */
      }
    })();
  }, [load, loadEcho]);

  async function doCheckin() {
    setBusy(true);
    try {
      const data = await apiFetch<CheckinState>("/api/checkin", {
        method: "POST",
        body: "{}",
      });
      setCheckin(data);
      success(`打卡成功 · ${data.stamp}`);
    } catch (e) {
      error(e instanceof Error ? e.message : "打卡失败");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="mx-auto max-w-6xl px-4 py-12">
      <div className="grid gap-6 md:grid-cols-2">
        <div className="panel rounded-2xl p-6">
          <h2 className="brand-font text-xl text-[var(--amber)]">今日金句</h2>
          {quote ? (
            <>
              <p className="mt-4 text-lg leading-relaxed text-[var(--ink)]">
                「{quote.content}」
              </p>
              <p className="mt-3 text-sm text-[var(--fog)]">
                — {quote.sender}
                {quote.isCurated ? " · 金句精选" : " · 归档随缘"}
              </p>
            </>
          ) : (
            <p className="mt-4 text-sm text-[var(--fog)]">
              还没有可用句子。导入群聊并在归档里标几条金句后，这里会每天轮换一句。
            </p>
          )}
        </div>

        <div className="panel rounded-2xl p-6">
          <h2 className="brand-font text-xl text-[var(--cyan)]">每日打卡</h2>
          <p className="mt-2 text-sm text-[var(--fog)]">
            来一趟绳网盖章，连签有惊喜感（纯本地记录，不发群）。
          </p>
          {checkin ? (
            <div className="mt-4 space-y-2 text-sm text-[var(--ink)]">
              <p>
                今日印章：
                <span className="text-[var(--amber)]">{checkin.stamp}</span>
              </p>
              <p>
                连续 {checkin.streak} 天 · 累计 {checkin.total} 次 · 今天全站{" "}
                {checkin.todayTotal} 人已盖章
              </p>
              <button
                type="button"
                className="btn btn-amber mt-2"
                disabled={busy || checkin.checkedIn}
                onClick={() => void doCheckin()}
              >
                {checkin.checkedIn ? "今日已打卡" : busy ? "盖章中…" : "盖章打卡"}
              </button>
            </div>
          ) : (
            <p className="mt-4 text-sm text-[var(--fog)]">加载打卡状态…</p>
          )}
        </div>

        <div className="panel rounded-2xl p-6">
          <h2 className="brand-font text-xl text-[var(--amber)]">今日焦点</h2>
          {spotlight ? (
            <>
              <p className="mt-4 text-lg text-[var(--ink)]">
                {spotlight.displayName}
                <span className="ml-2 text-sm text-[var(--fog)]">
                  归档文本约 {spotlight.textCount} 条
                </span>
              </p>
              {spotlight.sample ? (
                <p className="mt-3 text-sm text-[var(--fog)]">
                  印象句：「{spotlight.sample}」
                </p>
              ) : null}
            </>
          ) : (
            <p className="mt-4 text-sm text-[var(--fog)]">
              导入带 QQ 的群聊后，每天会轮换一位焦点群友。
            </p>
          )}
        </div>

        <div className="panel rounded-2xl p-6">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 className="brand-font text-xl text-[var(--cyan)]">记忆回响</h2>
            <button
              type="button"
              className="btn btn-ghost"
              onClick={() => {
                const next = echoSalt + 1;
                setEchoSalt(next);
                void loadEcho(next);
              }}
            >
              再回响一句
            </button>
          </div>
          {echo ? (
            <>
              <p className="mt-4 text-lg leading-relaxed text-[var(--ink)]">
                「{echo.content}」
              </p>
              <p className="mt-3 text-sm text-[var(--fog)]">
                — {echo.sender}
                {echo.sentAt ? ` · ${echo.sentAt}` : ""} · {echo.label}
              </p>
            </>
          ) : (
            <p className="mt-4 text-sm text-[var(--fog)]">
              导入归档后，这里会随机翻出一句旧时光。
            </p>
          )}
        </div>

        {weekdayItems.length ? (
          <details className="panel rounded-2xl p-6 md:col-span-2">
            <summary className="cursor-pointer brand-font text-xl text-[var(--amber)]">
              历史上的今天（同星期） · {weekdayItems.length} 条
            </summary>
            <p className="mt-2 text-sm text-[var(--fog)]">
              同一星期几的旧发言，点开慢慢翻。
            </p>
            <ul className="mt-4 space-y-3">
              {weekdayItems.slice(0, 5).map((item, i) => (
                <li key={i} className="text-sm text-[var(--ink)]">
                  <span className="text-[var(--cyan)]">{item.sender}</span>
                  {item.sentAt ? (
                    <span className="text-[var(--fog)]"> · {item.sentAt}</span>
                  ) : null}
                  <div className="mt-1">「{item.content}」</div>
                </li>
              ))}
            </ul>
          </details>
        ) : null}
      </div>
    </section>
  );
}
