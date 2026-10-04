import type { ReactNode } from "react";
import { HeroCanvas } from "@/components/HeroCanvas";
import { Atmosphere } from "@/components/fx/Atmosphere";
import { LinkUp } from "@/components/fx/LinkUp";
import { NightDust } from "@/components/fx/NightDust";
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
  daysTogether,
} from "@/lib/constants";
import { PRIMARY_NAV_KEYS } from "@/lib/nav";

const pad2 = (n: number) => String(n).padStart(2, "0");

/**
 * 门禁舞台：撑满视口的夜街 + 前景街角主体 + 「接入」引导。
 * 顶行是眉题与接入状态 HUD，中间左刊头右表单，底部一条街牌跑马灯。
 * mode 决定眉题文字。
 */
export function GateStage({
  mode,
  children,
}: {
  mode: "login" | "register";
  children: ReactNode;
}) {
  const together = daysTogether();
  const celebration = `${CELEBRATION_YEAR}.${pad2(CELEBRATION_MONTH)}.${pad2(CELEBRATION_DAY)}`;

  /* 底部街牌内容 */
  const tickerItems = [
    mode === "login" ? "ACCESS GATE // 口令墙" : "NEW MEMBER // 建档",
    `六分街 · ${GROUP_NAME}`,
    `DAY ${together}`,
    `庆典 ${celebration}`,
    "正日 07.10",
    ...PRIMARY_NAV_KEYS.map((k) => MODULE_META[k].label),
    "ROPE-NET STANDBY",
  ];

  return (
    <main className="hero-stage hero-stage--full relative overflow-hidden">
      <HeroCanvas dim />
      {/* 夜街浮尘：压在天空之上、主体与表单之下；门禁的文案底衬到 lg 才收起，粒子同步抬高 */}
      <NightDust narrow="lg" />
      <LinkUp />

      {/* 幽灵大字 */}
      <div
        aria-hidden
        className="ghost-type absolute -top-3 left-[-0.4rem] z-[1] md:left-[3vw] md:top-2"
      >
        {mode === "login" ? "IN" : "NEW"}
      </div>

      {/* 前景主体：顶天立地站在刊头与表单之间那条通道上 */}
      <StreetSubject className="gate-subject" dim />

      {/* 窄屏：文案底衬，街景再满也不压正文 */}
      <div aria-hidden className="hero-text-scrim lg:hidden" />

      <div className="hero-stage-inner relative z-10 mx-auto flex max-w-6xl flex-col px-4 pb-16 pt-5 md:pb-20 md:pt-7">
        {/* 顶行：眉题 + 接入状态 */}
        <div className="anim-rise flex items-start justify-between gap-3">
          <div className="flex max-w-[50%] flex-col gap-2 md:max-w-none md:flex-row md:items-center md:gap-3">
            <span className="sticker tilt-l self-start">
              {mode === "login" ? "Access Gate" : "New Member"}
            </span>
            <span className="eyebrow">口令墙 // {GROUP_NAME}</span>
          </div>
          <div className="mono flex items-center gap-3 text-[0.65rem] tracking-[0.22em] text-[var(--fog)] uppercase">
            <span className="hidden sm:inline">Day {together}</span>
            <span className="hidden h-3 w-px bg-[var(--line-strong)] sm:inline" />
            <span className="inline-flex items-center gap-1.5">
              <span className="dot-live" />
              <span className="text-[var(--cyan)]">Rope-Net Standby</span>
            </span>
          </div>
        </div>

        {/* 窄屏：给右上主体让位 */}
        <div className="h-[min(36svh,300px)] lg:hidden" />

        {/* 中间：左刊头 / 右表单，中间那条通道留给主体 */}
        <div className="my-auto grid items-center gap-10 lg:grid-cols-[1fr_minmax(0,24rem)] lg:py-8">
          <section className="anim-rise max-w-md lg:max-w-[22rem]">
            <h1 className="hero-title text-[3.2rem] sm:text-[4.2rem]">
              {SITE_BRAND}
            </h1>

            <div className="mt-4 flex flex-wrap items-center gap-3">
              <span className="caption-box text-sm">{SITE_TAGLINE}</span>
              <span className="tape">正日 07·10</span>
            </div>

            <p className="mt-5 max-w-md text-sm leading-relaxed text-[var(--fog)] md:text-base">
              {mode === "login"
                ? "这里是群友自己搭的周年站。拿着群口令和建档昵称，就能接入这条街。"
                : "第一次来？用群口令建档，绑定 QQ 收验证码，之后凭昵称进门。"}
            </p>

            {/* HUD 读数 */}
            <div className="mt-7 grid max-w-md grid-cols-3 gap-2">
              <div className="hud px-3 py-2.5">
                <div className="eyebrow text-[0.6rem]">Days</div>
                <div className="latin mt-0.5 text-2xl leading-none text-[var(--cyan)]">
                  {together}
                </div>
                <div className="mt-1 text-[0.68rem] text-[var(--fog)]">已同行</div>
              </div>
              <div className="hud px-3 py-2.5">
                <div className="eyebrow text-[0.6rem]">Day One</div>
                <div className="latin mt-0.5 text-2xl leading-none text-[var(--amber)]">
                  07.10
                </div>
                <div className="mt-1 text-[0.68rem] text-[var(--fog)]">正日周年</div>
              </div>
              <div className="hud px-3 py-2.5">
                <div className="eyebrow text-[0.6rem]">Party</div>
                <div className="latin mt-0.5 text-lg leading-none text-[var(--ink)] sm:text-2xl">
                  {celebration.slice(5)}
                </div>
                <div className="mt-1 text-[0.68rem] text-[var(--fog)]">今年庆典</div>
              </div>
            </div>

            {/* 频道预告 */}
            <div className="mt-7 hidden flex-wrap gap-2 sm:flex">
              {PRIMARY_NAV_KEYS.map((k, i) => (
                <span key={k} className="nav-chip">
                  <span className="mono text-[0.6rem] opacity-70">{pad2(i + 1)}</span>
                  {MODULE_META[k].label}
                </span>
              ))}
            </div>
          </section>

          {/* 右：表单 */}
          <section className="anim-rise-delay w-full lg:justify-self-end">
            {children}
          </section>
        </div>
      </div>

      {/* 底部街牌跑马灯 */}
      <div className="absolute inset-x-0 bottom-0 z-10 border-t border-[var(--line)] bg-[rgba(5,7,10,0.78)] py-2.5 text-[var(--fog)] backdrop-blur-sm">
        <Ticker items={tickerItems} />
      </div>

      <Atmosphere />
    </main>
  );
}
