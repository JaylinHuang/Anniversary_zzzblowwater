"use client";

import { useEffect, useState } from "react";

const SESSION_KEY = "zzz_linkup_seen";

/**
 * 门禁「接入新艾利都」的一瞬间。
 * - 退场由 CSS 动画驱动，没有脚本也会自己消失
 * - 点击 / 按键可跳过
 * - 同一会话只放一次；减少动态时由 CSS 直接隐藏
 */
export function LinkUp() {
  const [hidden, setHidden] = useState(false);
  const [skipped, setSkipped] = useState(false);

  useEffect(() => {
    try {
      if (window.sessionStorage.getItem(SESSION_KEY) === "1") {
        setHidden(true);
        return;
      }
      window.sessionStorage.setItem(SESSION_KEY, "1");
    } catch {
      /* 隐私模式等情况下忽略 */
    }

    function skip() {
      setSkipped(true);
    }
    window.addEventListener("keydown", skip, { once: true });
    window.addEventListener("pointerdown", skip, { once: true });
    // 动画结束后彻底移除，避免遮挡
    const t = window.setTimeout(() => setHidden(true), 2400);
    return () => {
      window.removeEventListener("keydown", skip);
      window.removeEventListener("pointerdown", skip);
      window.clearTimeout(t);
    };
  }, []);

  useEffect(() => {
    if (!skipped) return;
    const t = window.setTimeout(() => setHidden(true), 300);
    return () => window.clearTimeout(t);
  }, [skipped]);

  if (hidden) return null;

  return (
    <div
      className={`linkup ${skipped ? "is-skipped" : ""}`}
      role="status"
      aria-live="polite"
    >
      <div className="linkup-scan" />
      <div className="hud relative w-[min(26rem,calc(100vw-3rem))] p-6">
        <p className="eyebrow">LINK-UP // 新艾利都</p>
        <ul className="mono mt-4 space-y-1.5 text-sm text-[var(--fog)]">
          <li className="linkup-line" style={{ animationDelay: "0.1s" }}>
            <span className="text-[var(--cyan)]">▸</span> 正在接入绳网…
          </li>
          <li className="linkup-line" style={{ animationDelay: "0.55s" }}>
            <span className="text-[var(--cyan)]">▸</span> 定位：六分街 · zzz吹水群
          </li>
          <li className="linkup-line" style={{ animationDelay: "1s" }}>
            <span className="text-[var(--amber)]">▸</span> 口令墙就绪
          </li>
        </ul>
        <div className="mt-5 h-[3px] w-full bg-white/5">
          <div className="linkup-bar" />
        </div>
        <p className="mono mt-3 text-[0.65rem] tracking-[0.2em] text-[var(--fog)] opacity-70">
          点击任意处跳过
        </p>
      </div>
    </div>
  );
}
