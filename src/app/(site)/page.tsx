import Link from "next/link";
import { HeroCanvas } from "@/components/HeroCanvas";
import { HomeExtras } from "@/components/HomeExtras";
import {
  CELEBRATION_DAY,
  CELEBRATION_MONTH,
  CELEBRATION_YEAR,
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

  return (
    <div className="-mx-4 -mt-6">
      <section className="relative min-h-[100svh] overflow-hidden px-4">
        <HeroCanvas />
        <div className="relative z-10 mx-auto flex min-h-[100svh] max-w-6xl flex-col justify-end pb-16 pt-24 md:justify-center md:pb-24">
          <p className="anim-rise text-xs tracking-[0.28em] text-[var(--amber)]">
            NEW ERIDU NIGHTLIFE
          </p>
          <h1 className="brand-font anim-rise-delay mt-3 max-w-xl text-5xl leading-tight text-[var(--ink)] md:text-7xl">
            <span className="text-[var(--cyan)]">{SITE_BRAND}</span>
          </h1>
          <p className="anim-rise-delay mt-4 max-w-md text-base text-[var(--fog)] md:text-lg">
            {SITE_TAGLINE}
            <br />
            正日周年 7/10 · 今年庆典 {CELEBRATION_YEAR}/
            {String(CELEBRATION_MONTH).padStart(2, "0")}/
            {String(CELEBRATION_DAY).padStart(2, "0")}
          </p>
          <p className="anim-rise-delay mt-6 text-sm text-[var(--ink)]">
            已同行 <span className="text-[var(--cyan)]">{together}</span> 天
            {!cd.done ? (
              <>
                {" "}
                · 距庆典还剩{" "}
                <span className="text-[var(--amber)]">
                  {cd.days}天 {cd.hours}时
                </span>
              </>
            ) : (
              <> · 庆典进行中</>
            )}
          </p>
          <div className="anim-rise-delay mt-8 flex flex-wrap gap-3">
            <Link href="/wishes" className="btn btn-amber">
              写下祝福
            </Link>
            <Link href="/games" className="btn">
              去玩派对游戏
            </Link>
          </div>
        </div>
      </section>

      <HomeExtras
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

      <section className="mx-auto max-w-6xl px-4 py-16">
        <h2 className="brand-font text-2xl text-[var(--cyan)]">先从这里玩</h2>
        <p className="mt-2 text-sm text-[var(--fog)]">
          常用入口；更多模块在顶栏「更多」里。
        </p>
        <div className="mt-8 grid gap-4 sm:grid-cols-2">
          {primaryEntries.map((k) => (
            <Link
              key={k}
              href={MODULE_META[k].href}
              className="panel rounded-2xl p-5 transition hover:border-[rgba(61,224,208,0.45)]"
            >
              <div className="text-lg">{MODULE_META[k].label}</div>
              <div className="mt-1 text-sm text-[var(--fog)]">
                {MODULE_META[k].blurb}
              </div>
            </Link>
          ))}
        </div>
        {moreEntries.length ? (
          <div className="mt-10">
            <h3 className="text-sm text-[var(--amber)]">更多</h3>
            <div className="mt-4 flex flex-wrap gap-2">
              {moreEntries.map((k) => (
                <Link
                  key={k}
                  href={MODULE_META[k].href}
                  className="rounded-full border border-[var(--line)] px-4 py-2 text-sm text-[var(--fog)] transition hover:border-[rgba(61,224,208,0.45)] hover:text-[var(--ink)]"
                >
                  {MODULE_META[k].label}
                </Link>
              ))}
            </div>
          </div>
        ) : null}
      </section>
    </div>
  );
}
