"use client";

import { useEffect, useRef } from "react";

type Dot = {
  homeX: number;
  homeY: number;
  x: number;
  y: number;
  vx: number;
  vy: number;
  r: number;
  amber: boolean;
};

/**
 * 页内指针场。
 * 鼠标用弹簧跟踪：半隐式欧拉，加速度 = 刚度 × 位移 − 阻尼 × 速度。
 * 粒子靠近指针时被推开，再被拉回各自锚点，避免飘出舞台。
 * 减少动态时只画一帧静止点。
 */
export function PointerField() {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = ref.current;
    const stage = canvas?.closest(".page-stage") as HTMLElement | null;
    if (!canvas || !stage) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const fine = window.matchMedia("(pointer: fine)").matches;
    const dots: Dot[] = [];
    let w = 0;
    let h = 0;

    function layout() {
      const rect = canvas!.getBoundingClientRect();
      w = Math.max(1, rect.width);
      h = Math.max(1, rect.height);
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      canvas!.width = Math.floor(w * dpr);
      canvas!.height = Math.floor(h * dpr);
      ctx!.setTransform(dpr, 0, 0, dpr, 0, 0);
      if (dots.length) return;
      const count = 52;
      for (let i = 0; i < count; i++) {
        const x = ((i * 97) % 1000) / 1000 * w;
        const y = ((i * 53) % 1000) / 1000 * h;
        dots.push({
          homeX: x,
          homeY: y,
          x,
          y,
          vx: 0,
          vy: 0,
          r: 1.1 + (i % 4) * 0.45,
          amber: i % 5 === 0,
        });
      }
    }

    function paint(live: boolean) {
      ctx!.clearRect(0, 0, w, h);
      for (const d of dots) {
        ctx!.beginPath();
        ctx!.fillStyle = d.amber
          ? live
            ? "rgba(240,163,94,0.8)"
            : "rgba(240,163,94,0.4)"
          : live
            ? "rgba(61,224,208,0.72)"
            : "rgba(61,224,208,0.38)";
        ctx!.arc(d.x, d.y, d.r, 0, Math.PI * 2);
        ctx!.fill();
      }
    }

    layout();
    if (reduce || !fine) {
      paint(false);
      return;
    }

    let tx = 0;
    let ty = 0;
    let mx = 0;
    let my = 0;
    let vx = 0;
    let vy = 0;
    let px = -9999;
    let py = -9999;
    let inside = false;
    let raf = 0;

    function onMove(e: PointerEvent) {
      const rect = canvas!.getBoundingClientRect();
      inside = true;
      px = e.clientX - rect.left;
      py = e.clientY - rect.top;
      tx = (e.clientX / window.innerWidth) * 2 - 1;
      ty = (e.clientY / window.innerHeight) * 2 - 1;
    }

    function onLeave() {
      inside = false;
      tx = 0;
      ty = 0;
      px = -9999;
      py = -9999;
    }

    function frame() {
      const stiffness = 0.045;
      const damping = 0.22;
      vx += (tx - mx) * stiffness - vx * damping;
      vy += (ty - my) * stiffness - vy * damping;
      mx += vx;
      my += vy;
      stage!.style.setProperty("--mx", mx.toFixed(3));
      stage!.style.setProperty("--my", my.toFixed(3));

      for (const d of dots) {
        const dx = d.x - px;
        const dy = d.y - py;
        const dist = Math.hypot(dx, dy) || 1;
        if (inside && dist < 140) {
          const push = (140 - dist) / 140;
          d.vx += (dx / dist) * push * 1.35;
          d.vy += (dy / dist) * push * 1.35;
        }
        d.vx += (d.homeX - d.x) * 0.012 - d.vx * 0.08;
        d.vy += (d.homeY - d.y) * 0.012 - d.vy * 0.08;
        d.x += d.vx;
        d.y += d.vy;
      }
      paint(true);
      raf = requestAnimationFrame(frame);
    }

    window.addEventListener("pointermove", onMove, { passive: true });
    document.addEventListener("pointerleave", onLeave);
    window.addEventListener("resize", layout);
    raf = requestAnimationFrame(frame);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("pointermove", onMove);
      document.removeEventListener("pointerleave", onLeave);
      window.removeEventListener("resize", layout);
    };
  }, []);

  return <canvas ref={ref} className="page-pointer" aria-hidden />;
}
