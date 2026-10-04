"use client";

import { useEffect, useRef, type ReactNode } from "react";

/**
 * 鼠标视差容器：把指针位置写成 --mx / --my（-1 ~ 1），
 * 子层用 .plx-far / .plx-mid / .plx-near 读取。
 * 触屏、减少动态时不监听。
 */
export function Parallax({
  children,
  className = "",
}: {
  children: ReactNode;
  className?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const fine = window.matchMedia("(pointer: fine)").matches;
    if (reduce || !fine) return;

    let raf = 0;
    let mx = 0;
    let my = 0;

    function onMove(e: PointerEvent) {
      mx = (e.clientX / window.innerWidth) * 2 - 1;
      my = (e.clientY / window.innerHeight) * 2 - 1;
      if (raf) return;
      raf = requestAnimationFrame(() => {
        raf = 0;
        el!.style.setProperty("--mx", mx.toFixed(3));
        el!.style.setProperty("--my", my.toFixed(3));
      });
    }

    function onLeave() {
      el!.style.setProperty("--mx", "0");
      el!.style.setProperty("--my", "0");
    }

    window.addEventListener("pointermove", onMove, { passive: true });
    document.addEventListener("pointerleave", onLeave);
    return () => {
      window.removeEventListener("pointermove", onMove);
      document.removeEventListener("pointerleave", onLeave);
      if (raf) cancelAnimationFrame(raf);
    };
  }, []);

  return (
    <div ref={ref} className={className}>
      {children}
    </div>
  );
}
