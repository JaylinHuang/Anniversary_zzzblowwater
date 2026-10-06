"use client";

import { useEffect, useRef, useState } from "react";

const GESTURES = ["hop", "lean", "sway", "pop"] as const;

/** 点按只播本地动画，不请求服务器。2.5 秒内超过 50 下才停用 */
const CLICK_WINDOW_MS = 2500;
const CLICK_LIMIT = 50;
const LOCK_MS = 8000;

/** 单聊右侧的 Q 版：平时轻轻呼吸，隔几秒随机做一个小动作。点一下会蹲下再弹起。 */
export function AgentChibi({
  name,
  src,
}: {
  name: string;
  src: string | null;
}) {
  const [gesture, setGesture] = useState("");
  const [locked, setLocked] = useState(false);
  const [warnOpen, setWarnOpen] = useState(false);
  const generation = useRef(0);
  const clickUntil = useRef(0);
  const clicks = useRef<number[]>([]);
  const lockedUntil = useRef(0);
  const figureRef = useRef<HTMLButtonElement>(null);
  const shadowRef = useRef<HTMLDivElement>(null);
  const hopEnd = useRef<((ev: AnimationEvent) => void) | null>(null);

  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    let cancelled = false;
    let timer = 0;
    const arm = () => {
      const wait = 4200 + Math.random() * 4800;
      timer = window.setTimeout(() => {
        if (cancelled) return;
        if (Date.now() < clickUntil.current) {
          arm();
          return;
        }
        const mine = ++generation.current;
        const next = GESTURES[Math.floor(Math.random() * GESTURES.length)];
        setGesture(next);
        timer = window.setTimeout(() => {
          if (cancelled) return;
          if (generation.current !== mine) {
            arm();
            return;
          }
          setGesture("");
          arm();
        }, 960);
      }, wait);
    };
    arm();
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, []);

  useEffect(() => {
    if (!locked) return;
    const left = lockedUntil.current - Date.now();
    const timer = window.setTimeout(() => setLocked(false), Math.max(0, left));
    return () => window.clearTimeout(timer);
  }, [locked]);

  /** 立刻停掉呼吸和随机动作，从头播放蹲下再弹起。连点会取消上一次。 */
  function playHop() {
    const fig = figureRef.current;
    const shadow = shadowRef.current;
    if (!fig) return;
    const mine = ++generation.current;
    clickUntil.current = Date.now() + 920;
    setGesture("hop");
    for (const el of [fig, shadow]) {
      if (!el) continue;
      el.classList.remove("is-lean", "is-sway", "is-pop", "is-hop2");
      el.classList.add("is-hop");
      el.style.animation = "none";
      el.getAnimations().forEach((anim) => anim.cancel());
    }
    void fig.offsetWidth;
    fig.style.animation = "";
    if (shadow) shadow.style.animation = "";
    if (hopEnd.current) fig.removeEventListener("animationend", hopEnd.current);
    const onEnd = (ev: AnimationEvent) => {
      if (ev.animationName !== "chibi-hop") return;
      if (generation.current !== mine) return;
      setGesture("");
    };
    hopEnd.current = onEnd;
    fig.addEventListener("animationend", onEnd);
  }

  function poke() {
    const now = Date.now();
    if (now < lockedUntil.current) return;
    clicks.current = clicks.current.filter((at) => now - at < CLICK_WINDOW_MS);
    clicks.current.push(now);
    if (clicks.current.length > CLICK_LIMIT) {
      clicks.current = [];
      lockedUntil.current = now + LOCK_MS;
      setLocked(true);
      setWarnOpen(true);
      return;
    }
    playHop();
  }

  const motion = gesture ? ` is-${gesture}` : "";

  return (
    <div className="chibi-stage">
      <button
        ref={figureRef}
        type="button"
        className={`chibi-figure${motion}${locked ? " is-locked" : ""}`}
        onClick={poke}
        disabled={locked}
        aria-label={locked ? "操作频繁，稍后再试" : `点一下${name}`}
      >
        {src ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={src} alt="" />
        ) : (
          <span className="chibi-fallback">{name.slice(0, 1)}</span>
        )}
      </button>
      <div ref={shadowRef} className={`chibi-shadow${motion}`} aria-hidden />
      <p className="chibi-name">{name}</p>

      {warnOpen ? (
        <div className="chibi-mask" role="presentation">
          <div
            className="panel chibi-dialog"
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="chibi-warn-title"
          >
            <h3 id="chibi-warn-title" className="brand-font text-xl text-[var(--amber)]">
              操作频繁，稍后再试
            </h3>
            <button
              type="button"
              className="btn btn-amber mt-5"
              onClick={() => setWarnOpen(false)}
            >
              知道了
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
