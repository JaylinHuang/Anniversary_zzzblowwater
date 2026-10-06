import Link from "next/link";
import { HeroCanvas } from "@/components/HeroCanvas";
import { HomeExtras } from "@/components/HomeExtras";
import { NightDust } from "@/components/fx/NightDust";
import { Reveal } from "@/components/fx/Reveal";
import { StreetSubject } from "@/components/fx/StreetSubject";
import { Ticker } from "@/components/fx/Ticker";
import {
  CELEBRATION_DAY,
  CELEBRATION_MONTH,
  CELEBRATION_YEAR,
  GROUP_NAME,
  MODULE_META,
  SITE_BRAND,
  SITE_TAGLINE,
  countdownParts,
  daysTogether,
  nextCelebrationDate,
} from "@/lib/constants";
import { getDailyQuote } from "@/lib/daily-quote";
import { getFeatureFlags } from "@/lib/modules";
import { PRIMARY_NAV_KEYS, MORE_NAV_KEYS } from "@/lib/nav";
import { getDailySpotlight } from "@/lib/spotlight";

const pad2 = (n: number) => String(n).padStart(2, "0");

export default async function HomePage() {
  const flags = await getFeatureFlags();
  const together = daysTogether();
  const target = nextCelebrationDate();
  const cd = countdownParts(target);
  const [quote, spotlight] = await Promise.all([
    getDailyQuote(),
    getDailySpotlight(),
  ]);
  const primaryEntries = PRIMARY_NAV_KEYS.filter((k) => flags[k]);
  const moreEntries = MORE_NAV_KEYS.filter((k) => flags[k]);
  const celebrationLabel = `${CELEBRATION_YEAR}.${pad2(CELEBRATION_MONTH)}.${pad2(CELEBRATION_DAY)}`;
  /* 小报日期行（服务端生成，避免水合不一致） */
  const dateLabel = new Date().toLocaleDateString("zh-CN", {
    year: "numeric",
    month: "long",
    day: "numeric",
    weekday: "long",
  });

  /* 街牌跑马灯内容 */
  const tickerItems = [
    "NEW ERIDU NIGHTLIFE",
    `六分街 · ${GROUP_NAME}`,
    `DAY ${together}`,
    `庆典 ${celebrationLabel}`,
    "正日 07.10",
    ...primaryEntries.map((k) => MODULE_META[k].label),
    "绳网接入 OK",
  ];

  const channelCount = primaryEntries.length + moreEntries.length;
  const countdownLabel = cd.done ? "LIVE" : `${cd.days}D ${cd.hours}H`;

  /* 小报右栏「街区公告」：全部来自已有常量，不新增请求 */
  const notices = [
    cd.done ? "今年庆典进行中，老地方见" : `距今年庆典还有 ${cd.days} 天 ${cd.hours} 小时`,
    `群已同行 ${together} 天，灯一直亮着`,
    `${channelCount} 个频道开放：${primaryEntries.map((k) => MODULE_META[k].label).join(" / ")}`,
    `正日 07·10 · 今年庆典 ${celebrationLabel}`,
  ];

  return (
    <div className="-mt-6">
      {/* ===== 主视觉：夜街（撑满视口，前景主体 + 围着它排的读数芯片） ===== */}
      <section className="bleed hero-stage relative overflow-hidden">
        <HeroCanvas />
        {/* 夜街浮尘：压在天空之上、铃哲与文字之下；首页文案底衬到 md 收起，窄屏粒子抬到底衬之上 */}
        <NightDust narrow="md" />

        {/* 幽灵大字：左上版式底纹 */}
        <div
          aria-hidden
          className="ghost-type absolute -top-3 left-[-0.4rem] z-[1] md:left-[3vw] md:top-2"
        >
          01
        </div>

        {/* 前景主体：铃与哲 + 吹水茶室 + 睡猫机器人 */}
        <StreetSubject className="hero-subject" />

        {/* 手机：文案底衬，街景再满也不压正文 */}
        <div aria-hidden className="hero-text-scrim md:hidden" />

        {/* 读数芯片：绕着主体排，留出人物轮廓 */}
        <div className="hero-chips">
          <div
            className="chip-days chip-float panel panel-solid px-3 py-2 md:px-5 md:py-4"
            style={{ animationDelay: "0s" }}
          >
            {/* 手机位置窄，眉题只留 Days */}
            <div className="eyebrow">
              <span className="md:hidden">Days</span>
              <span className="hidden md:inline">Days Together</span>
            </div>
            <div className="latin mt-1 text-3xl leading-none text-[var(--cyan)] md:text-5xl">
              {together}
            </div>
            <div className="mt-1 text-[0.68rem] text-[var(--fog)] md:text-xs">
              已同行 · 天
            </div>
          </div>

          <div
            className="chip-count chip-float panel panel-solid px-3 py-2 md:px-5 md:py-4"
            style={{ animationDelay: "-1.8s" }}
          >
            <div className="eyebrow">Countdown</div>
            <div className="latin mt-1 text-2xl leading-none text-[var(--amber)] md:text-4xl">
              {countdownLabel}
            </div>
            <div className="mt-1 text-[0.68rem] text-[var(--fog)] md:text-xs">
              {cd.done ? "庆典进行中" : "距今年庆典"}
            </div>
          </div>

          <div
            className="chip-party chip-float panel panel-solid hidden px-5 py-4 md:block xl:px-4 xl:py-3"
            style={{ animationDelay: "-3.2s" }}
          >
            <div className="eyebrow">Celebration</div>
            <div className="latin mt-1 text-3xl leading-none text-[var(--ink)] xl:text-2xl">
              {celebrationLabel}
            </div>
            <div className="mt-1 text-xs text-[var(--fog)]">今年庆典日</div>
          </div>

          <div
            className="chip-ch chip-float hidden xl:block"
            style={{ animationDelay: "-4.4s" }}
          >
            <span className="sticker sticker-cyan tilt-r text-sm">
              CH × {channelCount} 频道开放
            </span>
          </div>

          {/* 地标标签：钉在店门口的路面上 */}
          <div className="hero-loc hidden items-center gap-2 md:flex">
            <span className="dot-live" />
            <span className="mono text-[0.62rem] tracking-[0.22em] text-[var(--fog)] uppercase">
              LOC 六分街 · 吹水茶室 · 营业中
            </span>
          </div>
        </div>

        <div className="hero-stage-inner relative z-10 mx-auto flex max-w-7xl flex-col px-4 pb-16 pt-5 md:pb-20 md:pt-7">
          {/* 顶行：眉题 + HUD 读数 */}
          <div className="anim-rise flex items-start justify-between gap-3">
            <div className="flex max-w-[48%] flex-col gap-2 md:max-w-none md:flex-row md:items-center md:gap-3">
              <span className="sticker tilt-l self-start">VOL.01 · 1ST ANNIV</span>
              <span className="eyebrow">New Eridu Nightlife // {GROUP_NAME}</span>
            </div>
            <div className="mono hidden items-center gap-3 text-[0.65rem] tracking-[0.22em] text-[var(--fog)] uppercase md:flex">
              <span>Ch {pad2(channelCount)}</span>
              <span className="h-3 w-px bg-[var(--line-strong)]" />
              <span>Day {together}</span>
              <span className="h-3 w-px bg-[var(--line-strong)]" />
              <span className="text-[var(--cyan)]">Rope-Net OK</span>
            </div>
          </div>

          {/* 手机：给右上的主体让位 */}
          <div className="h-[min(38svh,300px)] md:hidden" />

          {/* 标题块：手机贴底，桌面垂直居中、靠左，宽度收住给主体让出通道 */}
          <div className="relative mt-auto md:my-auto md:max-w-[42%] md:pt-6">
            {/* 桌面字号由 .hero-title--one-line 按视口宽度给，保证一行放下 */}
            <h1 className="hero-title hero-title--one-line anim-rise-delay text-[3.6rem] sm:text-[4.5rem]">
              {SITE_BRAND}
            </h1>

            <div className="anim-rise-2 mt-4 flex flex-wrap items-center gap-3 md:mt-5">
              <span className="caption-box text-sm">{SITE_TAGLINE}</span>
              <span className="tape">正日 07·10</span>
            </div>

            <p className="anim-rise-2 mt-4 max-w-md text-sm leading-relaxed text-[var(--fog)] md:mt-5 md:text-base">
              一年前这群人在绳网上碰头，从此六分街多了一盏不熄的灯。
              今年庆典定在 {celebrationLabel}，老地方见。
            </p>

            <div className="anim-rise-3 mt-6 flex flex-wrap gap-3 md:mt-7">
              <Link href="/wishes" className="btn btn-amber">
                写下祝福 →
              </Link>
              <Link href="/games" className="btn btn-ghost">
                去玩派对游戏
              </Link>
            </div>
          </div>
        </div>

        {/* 底部街牌跑马灯 */}
        <div className="absolute inset-x-0 bottom-0 z-10 border-t border-[var(--line)] bg-[rgba(5,7,10,0.78)] py-2.5 text-[var(--fog)] backdrop-blur-sm">
          <Ticker items={tickerItems} />
        </div>
      </section>

      {/* 街沿：主视觉与版面之间的斑马带 */}
      <div className="bleed hazard h-[3px] opacity-50" />

      {/* ===== 02 · 今日版面 ===== */}
      <HomeExtras
        issueNo={together}
        dateLabel={dateLabel}
        notices={notices}
        quote={
          quote
            ? {
                content: quote.content,
                sender: quote.sender,
                isCurated: quote.isCurated,
              }
            : null
        }
        spotlight={
          spotlight
            ? {
                displayName: spotlight.displayName,
                textCount: spotlight.textCount,
                sample: spotlight.sample,
              }
            : null
        }
      />

      {/* ===== 03 · 频道 ===== */}
      <section className="py-16">
        <Reveal>
          <div className="sec-head">
            <span className="idx">03</span>
            <h2 className="brand-font text-2xl text-[var(--cyan)]">先从这里玩</h2>
            <span className="sec-rule" />
            <span className="eyebrow hidden sm:inline">Channels</span>
          </div>
        </Reveal>

        <div className="mt-8 grid gap-4 sm:grid-cols-2">
          {primaryEntries.map((k, i) => (
            <Reveal key={k} delay={i * 80}>
              <Link
                href={MODULE_META[k].href}
                className="panel card-sheen block p-5"
              >
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <span className="mono text-[0.65rem] tracking-[0.25em] text-[var(--amber)]">
                      CH.{pad2(i + 1)}
                    </span>
                    <div className="brand-font mt-1 text-xl text-[var(--ink)]">
                      {MODULE_META[k].label}
                    </div>
                    <div className="mt-1 text-sm text-[var(--fog)]">
                      {MODULE_META[k].blurb}
                    </div>
                  </div>
                  <span className="sticker sticker-ink shrink-0">Go →</span>
                </div>
              </Link>
            </Reveal>
          ))}
        </div>

        {moreEntries.length ? (
          <Reveal delay={120}>
            <div className="mt-10">
              <div className="flex items-center gap-3">
                <span className="eyebrow">More Channels</span>
                <span className="sec-rule" />
              </div>
              <div className="mt-4 flex flex-wrap gap-2">
                {moreEntries.map((k, i) => (
                  <Link
                    key={k}
                    href={MODULE_META[k].href}
                    className="nav-chip hover:text-[var(--ink)]"
                  >
                    <span className="mono text-[0.6rem] opacity-70">
                      {pad2(primaryEntries.length + i + 1)}
                    </span>
                    {MODULE_META[k].label}
                  </Link>
                ))}
              </div>
            </div>
          </Reveal>
        ) : null}
      </section>
    </div>
  );
}
