"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { Reveal } from "@/components/fx/Reveal";
import { useToast } from "@/components/ToastProvider";
import { apiFetch } from "@/lib/api-client";

type CheckinState = {
  today: string;
  checkedIn: boolean;
  stamp: string;
  streak: number;
  total: number;
  todayTotal: number;
  /** 最近 7 天逐日盖章情况（从早到晚，最后一项是今天） */
  recentDays?: { date: string; checkedIn: boolean }[];
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
  issueNo,
  dateLabel,
  notices = [],
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
  /** 小报期号（服务端算好传入，避免水合不一致） */
  issueNo?: number;
  /** 小报日期行 */
  dateLabel?: string;
  /** 小报右栏「街区公告」：由服务端用常量拼好，纯展示 */
  notices?: string[];
}) {
  const { success, error } = useToast();
  const [checkin, setCheckin] = useState<CheckinState | null>(null);
  const [echo, setEcho] = useState<Echo | null>(null);
  const [weekdayItems, setWeekdayItems] = useState<WeekdayItem[]>([]);
  // 回响加载状态：loading 加载中 / ready 有内容 / empty 无归档 / error 请求失败
  const [echoStatus, setEchoStatus] = useState<"loading" | "ready" | "empty" | "error">(
    "loading",
  );
  // 同星期加载状态：loading 加载中 / ready 已加载（含空结果）/ error 请求失败
  const [weekdayStatus, setWeekdayStatus] = useState<"loading" | "ready" | "error">(
    "loading",
  );
  const [busy, setBusy] = useState(false);
  const [echoSalt, setEchoSalt] = useState(0);
  // 本次会话里刚刚打卡成功的日期：只有这一格播放落印动画；页面刷新后进来的已盖格子不播
  const [stampedDate, setStampedDate] = useState<string | null>(null);

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
      const data = await apiFetch<{ echo: Echo | null }>(`/api/memory-echo?salt=${salt}`);
      if (data.echo) {
        setEcho(data.echo);
        setEchoStatus("ready");
      } else {
        // 没有归档：清空旧内容，进入空态
        setEcho(null);
        setEchoStatus("empty");
      }
    } catch {
      // 请求失败时保留已有内容；没有内容则显示失败态
      setEchoStatus((s) => (s === "ready" ? s : "error"));
    }
  }, []);

  // 加载同星期旧发言；失败时标记 error（已有内容则保留），由界面给出重试/归档入口
  const loadWeekday = useCallback(async () => {
    try {
      const data = await apiFetch<{ items: WeekdayItem[] }>("/api/weekday-echo");
      setWeekdayItems(data.items || []);
      setWeekdayStatus("ready");
    } catch {
      setWeekdayStatus((s) => (s === "ready" ? s : "error"));
    }
  }, []);

  useEffect(() => {
    void load();
    void loadEcho(0);
    void loadWeekday();
  }, [load, loadEcho, loadWeekday]);

  async function doCheckin() {
    setBusy(true);
    try {
      const data = await apiFetch<CheckinState>("/api/checkin", {
        method: "POST",
        body: "{}",
      });
      setCheckin(data);
      // 记下今天的日期，让最近 7 天里今天那一格播一段落印动画
      setStampedDate(data.today);
      success(`打卡成功 · ${data.stamp}`);
    } catch (e) {
      error(e instanceof Error ? e.message : "打卡失败");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="pb-12 pt-8">
      <Reveal>
        <div className="sec-head">
          <span className="idx">02</span>
          <h2 className="brand-font text-2xl text-[var(--amber)]">今日版面</h2>
          <span className="sec-rule" />
          <span className="eyebrow hidden sm:inline">Daily Edition</span>
        </div>
      </Reveal>

      <div className="mt-6 grid gap-5 lg:grid-cols-12">
        {/* 今日金句：都市小报（头条 + 街区公告两栏，纸面不留白） */}
        <Reveal className="lg:col-span-7" delay={0}>
          <article className="panel panel-paper masthead relative flex h-full flex-col p-6 md:p-7">
            <div className="flex items-end justify-between gap-4">
              <div>
                <div className="masthead-title text-3xl md:text-4xl">新艾利都晚报</div>
                <div className="latin mt-1 text-[0.7rem] tracking-[0.3em] opacity-70">
                  New Eridu Evening Post
                </div>
              </div>
              <span className="sticker sticker-signal tilt-r">今日金句</span>
            </div>
            <div className="masthead-rule mt-3" />
            <div className="mono flex flex-wrap items-center justify-between gap-2 py-1.5 text-[0.68rem] tracking-[0.12em] opacity-80">
              <span>{dateLabel || "今日"}</span>
              <span>{issueNo != null ? `第 ${issueNo} 期` : "特刊"}</span>
              <span>天气：霓虹 · 有雨</span>
            </div>
            <div className="masthead-rule-thin" />

            <div className="mt-5 grid flex-1 gap-5 sm:grid-cols-[1.35fr_1fr]">
              {/* 左栏：头条金句 */}
              <div className="flex flex-col">
                <p className="latin text-[0.62rem] tracking-[0.3em] opacity-60">Headline // 头条</p>
                {quote ? (
                  <>
                    <p className="mt-3 text-xl leading-relaxed md:text-2xl">
                      「{quote.content}」
                    </p>
                    <p className="mt-4 text-sm opacity-80">
                      — {quote.sender}
                      <span className="mx-2 opacity-50">|</span>
                      {quote.isCurated ? "金句精选" : "归档随缘"}
                    </p>
                  </>
                ) : (
                  <>
                    <p className="masthead-title mt-3 text-2xl leading-tight md:text-[1.7rem]">
                      六分街今夜照常营业
                    </p>
                    <p className="mt-3 text-sm leading-relaxed opacity-80">
                      还没有可用句子。导入群聊并在归档里标几条金句后，这里会每天轮换一句，
                      登上晚报头条。
                    </p>
                  </>
                )}
                {/* 栏尾：铅字小格 */}
                <div className="mt-auto flex items-center gap-2 pt-5">
                  <span className="inline-block h-2 w-2 bg-[var(--paper-ink)]" />
                  <span className="mono text-[0.62rem] tracking-[0.2em] opacity-60">
                    EVENING POST · NON-OFFICIAL
                  </span>
                </div>
              </div>

              {/* 右栏：街区公告 */}
              <aside className="border-t border-[rgba(22,24,28,0.3)] pt-4 sm:border-l sm:border-t-0 sm:pl-5 sm:pt-0">
                <p className="latin text-[0.62rem] tracking-[0.3em] opacity-60">Notice // 街区公告</p>
                <ul className="mt-3 space-y-2.5">
                  {notices.map((n, i) => (
                    <li key={i} className="flex gap-2 text-[0.8rem] leading-snug">
                      <span className="mono shrink-0 text-[0.62rem] leading-[1.5] tracking-[0.15em] opacity-60">
                        {String(i + 1).padStart(2, "0")}
                      </span>
                      <span>{n}</span>
                    </li>
                  ))}
                </ul>
                {/* 版角小广告：半调框 */}
                <div className="mt-4 border border-dashed border-[rgba(22,24,28,0.45)] px-3 py-2">
                  <div className="flex items-center justify-between gap-2">
                    <span className="masthead-title text-sm">吹水茶室</span>
                    <span className="latin text-[0.6rem] tracking-[0.25em] opacity-70">24H</span>
                  </div>
                  <p className="mt-1 text-[0.72rem] leading-snug opacity-75">
                    六分街拐角 · 夜聊供热饮 · 睡猫机器人值班
                  </p>
                </div>
              </aside>
            </div>

            {/* 版角装饰：半调 */}
            <div className="halftone-fade pointer-events-none absolute bottom-0 right-0 h-24 w-40 bg-[radial-gradient(circle,rgba(22,24,28,0.3)_1.2px,transparent_1.6px)] bg-[length:6px_6px]" />
          </article>
        </Reveal>

        {/* 每日打卡：盖章 */}
        <Reveal className="lg:col-span-5" delay={80}>
          <div className="panel relative h-full p-6">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="eyebrow">Check-in // 绳网盖章</p>
                <h3 className="brand-font mt-2 text-xl text-[var(--cyan)]">每日打卡</h3>
              </div>
              {checkin?.checkedIn ? (
                <span className="stamp">{checkin.stamp}</span>
              ) : (
                <span className="stamp opacity-30">待盖章</span>
              )}
            </div>
            <p className="mt-2 text-sm text-[var(--fog)]">
              来一趟绳网盖章，连签有惊喜感（纯本地记录，不发群）。
            </p>
            {checkin ? (
              <div className="mt-4 text-sm text-[var(--ink)]">
                <div className="mono grid grid-cols-3 gap-2 text-center">
                  <div className="bg-white/[0.04] px-2 py-2">
                    <div className="latin text-2xl text-[var(--amber)]">{checkin.streak}</div>
                    <div className="text-[0.65rem] tracking-[0.15em] text-[var(--fog)]">连续 / 天</div>
                  </div>
                  <div className="bg-white/[0.04] px-2 py-2">
                    <div className="latin text-2xl text-[var(--cyan)]">{checkin.total}</div>
                    <div className="text-[0.65rem] tracking-[0.15em] text-[var(--fog)]">累计 / 次</div>
                  </div>
                  <div className="bg-white/[0.04] px-2 py-2">
                    <div className="latin text-2xl text-[var(--ink)]">{checkin.todayTotal}</div>
                    <div className="text-[0.65rem] tracking-[0.15em] text-[var(--fog)]">今日 / 人</div>
                  </div>
                </div>
                {/* 最近 7 天盖章：状态来自接口返回的真实签到记录，无记录显示为空格 */}
                {checkin.recentDays?.length ? (
                  <div className="mt-3">
                    <p className="mono text-[0.65rem] tracking-[0.15em] text-[var(--fog)]">
                      最近 7 天
                    </p>
                    <div className="mono mt-2 grid grid-cols-7 gap-1.5 text-center">
                      {checkin.recentDays.map((d) => {
                        // 刚打卡成功的那一格：加 is-stamping 播落印动画（样式见 globals.css 的 .ci-cell）
                        const stamping = d.checkedIn && d.date === stampedDate;
                        return (
                          <div
                            key={d.date}
                            title={`${d.date} ${d.checkedIn ? "已盖章" : "未盖章"}`}
                            className={`ci-cell px-1 py-1.5 ${
                              d.checkedIn
                                ? "border border-[var(--amber)] bg-[var(--amber)]/10 text-[var(--amber)]"
                                : "border border-dashed border-[var(--line)] text-[var(--fog)] opacity-50"
                            }${stamping ? " is-stamping" : ""}`}
                          >
                            <div className="text-[0.6rem]">{d.date.slice(5).replace("-", "/")}</div>
                            <div className="ci-mark text-sm leading-none">{d.checkedIn ? "✓" : "·"}</div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                ) : null}
                <p className="mt-3 text-xs text-[var(--fog)]">
                  今日印章：
                  <span className="text-[var(--amber)]">{checkin.stamp}</span>
                </p>
                <button
                  type="button"
                  className="btn btn-amber mt-4"
                  disabled={busy || checkin.checkedIn}
                  onClick={() => void doCheckin()}
                >
                  {checkin.checkedIn ? "今日已打卡" : busy ? "盖章中…" : "盖章打卡"}
                </button>
              </div>
            ) : (
              <p className="mono mt-4 text-xs tracking-[0.15em] text-[var(--fog)]">
                ▸ 加载打卡状态…
              </p>
            )}
          </div>
        </Reveal>

        {/* 今日焦点 */}
        <Reveal className="lg:col-span-5" delay={60}>
          <div className="panel relative h-full p-6">
            <p className="eyebrow">Spotlight // 今日焦点</p>
            {spotlight ? (
              <>
                <div className="mt-3 flex flex-wrap items-end gap-3">
                  <h3 className="brand-font text-3xl text-[var(--ink)]">
                    {spotlight.displayName}
                  </h3>
                  <span className="tape">归档 {spotlight.textCount} 条</span>
                </div>
                {spotlight.sample ? (
                  <p className="mt-4 border-l-2 border-[var(--amber)] pl-3 text-sm leading-relaxed text-[var(--fog)]">
                    印象句：「{spotlight.sample}」
                  </p>
                ) : null}
              </>
            ) : (
              <>
                <h3 className="brand-font mt-2 text-xl text-[var(--amber)]">今日焦点</h3>
                <p className="mt-3 text-sm text-[var(--fog)]">
                  导入带 QQ 的群聊后，每天会轮换一位焦点群友。
                </p>
              </>
            )}
          </div>
        </Reveal>

        {/* 记忆回响 */}
        <Reveal className="lg:col-span-7" delay={140}>
          <div className="panel relative h-full p-6">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="eyebrow">Echo // 记忆回响</p>
                <h3 className="brand-font mt-2 text-xl text-[var(--cyan)]">记忆回响</h3>
              </div>
              {/* 仅在已有可回响内容时才可换一句；空态/加载中/失败时禁用，避免空转 */}
              <button
                type="button"
                className="btn btn-ghost"
                disabled={echoStatus !== "ready"}
                onClick={() => {
                  const next = echoSalt + 1;
                  setEchoSalt(next);
                  void loadEcho(next);
                }}
              >
                再回响一句 ↻
              </button>
            </div>
            {echo ? (
              <>
                <p className="mt-4 text-lg leading-relaxed text-[var(--ink)]">
                  「{echo.content}」
                </p>
                <p className="mono mt-3 text-xs tracking-[0.08em] text-[var(--fog)]">
                  — {echo.sender}
                  {echo.sentAt ? ` · ${echo.sentAt}` : ""} · {echo.label}
                </p>
              </>
            ) : echoStatus === "empty" ? (
              <div className="mt-4 flex flex-wrap items-center gap-3">
                <p className="text-sm text-[var(--fog)]">
                  还没有可回响的归档。导入群聊后，这里会随机翻出一句旧时光。
                </p>
                <Link href="/archive" className="btn btn-amber">
                  去群聊归档 →
                </Link>
              </div>
            ) : echoStatus === "error" ? (
              <div className="mt-4 flex flex-wrap items-center gap-3">
                <p className="text-sm text-[var(--fog)]">回响暂时没接上，稍后再试。</p>
                <button
                  type="button"
                  className="btn btn-ghost"
                  onClick={() => void loadEcho(echoSalt)}
                >
                  重试
                </button>
              </div>
            ) : (
              <p className="mono mt-4 text-xs tracking-[0.15em] text-[var(--fog)]">
                ▸ 回响加载中…
              </p>
            )}
          </div>
        </Reveal>

        {/* 历史上的今天 */}
        {weekdayItems.length ? (
          <Reveal className="lg:col-span-12" delay={100}>
            <details className="panel p-6">
              <summary className="flex cursor-pointer flex-wrap items-center gap-3">
                <span className="eyebrow">Archive // 同星期</span>
                <span className="brand-font text-xl text-[var(--amber)]">历史上的今天</span>
                <span className="sticker sticker-ink">{weekdayItems.length} 条</span>
              </summary>
              <p className="mt-2 text-sm text-[var(--fog)]">
                同一星期几的旧发言，点开慢慢翻。
              </p>
              <ul className="mt-4 divide-y divide-[var(--line)]">
                {weekdayItems.slice(0, 5).map((item, i) => (
                  <li key={i} className="py-3 text-sm text-[var(--ink)]">
                    <span className="mono text-[0.65rem] tracking-[0.15em] text-[var(--amber)]">
                      {String(i + 1).padStart(2, "0")}
                    </span>
                    <span className="ml-2 text-[var(--cyan)]">{item.sender}</span>
                    {item.sentAt ? (
                      <span className="mono ml-2 text-xs text-[var(--fog)]">{item.sentAt}</span>
                    ) : null}
                    <div className="mt-1">「{item.content}」</div>
                  </li>
                ))}
              </ul>
            </details>
          </Reveal>
        ) : weekdayStatus === "error" ? (
          // 请求失败：整块不消失，留下说明，并给出重试与去归档入口
          <Reveal className="lg:col-span-12" delay={100}>
            <div className="panel p-6">
              <div className="flex flex-wrap items-center gap-3">
                <span className="eyebrow">Archive // 同星期</span>
                <span className="brand-font text-xl text-[var(--amber)]">历史上的今天</span>
              </div>
              <div className="mt-2 flex flex-wrap items-center gap-3">
                <p className="text-sm text-[var(--fog)]">
                  同星期的旧发言暂时没加载出来，可以重试，或直接去归档翻翻。
                </p>
                <button
                  type="button"
                  className="btn btn-ghost"
                  // 重试期间保持失败说明不变，避免整块闪没；成功后自动切换为列表或空态
                  onClick={() => void loadWeekday()}
                >
                  重试
                </button>
                <Link href="/archive" className="btn btn-amber">
                  去群聊归档 →
                </Link>
              </div>
            </div>
          </Reveal>
        ) : weekdayStatus === "ready" ? (
          // 同星期旧发言为空：保留整块，并给出通往归档的说明
          <Reveal className="lg:col-span-12" delay={100}>
            <div className="panel p-6">
              <div className="flex flex-wrap items-center gap-3">
                <span className="eyebrow">Archive // 同星期</span>
                <span className="brand-font text-xl text-[var(--amber)]">历史上的今天</span>
                <span className="sticker sticker-ink">0 条</span>
              </div>
              <div className="mt-2 flex flex-wrap items-center gap-3">
                <p className="text-sm text-[var(--fog)]">
                  还没有同一星期几的旧发言。去群聊归档看看已有的记录吧。
                </p>
                <Link href="/archive" className="btn btn-ghost">
                  去群聊归档 →
                </Link>
              </div>
            </div>
          </Reveal>
        ) : weekdayStatus === "loading" ? (
          // 首次拉取同星期数据：与失败/空态同一块面板，避免加载中整块消失
          <Reveal className="lg:col-span-12" delay={100}>
            <div className="panel p-6">
              <div className="flex flex-wrap items-center gap-3">
                <span className="eyebrow">Archive // 同星期</span>
                <span className="brand-font text-xl text-[var(--amber)]">历史上的今天</span>
              </div>
              <p className="mt-2 text-sm text-[var(--fog)]">加载中</p>
            </div>
          </Reveal>
        ) : null}
      </div>
    </section>
  );
}
