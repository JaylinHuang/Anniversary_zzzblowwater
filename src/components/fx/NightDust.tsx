import type { CSSProperties } from "react";

/**
 * 夜街浮尘：一层缓慢上浮、偶尔闪一下的霓虹微粒，给夜路加一点空气感。
 *
 * - 纯 CSS 动画，粒子参数在服务端用固定种子生成，首屏与水合结果一致，不闪。
 * - 颜色只用站点的青 #3de0d0 与琥珀 #f0a35e，底色由下层画布负责。
 * - 两种挂法：
 *     stage —— 挂在主视觉舞台里（首页夜街 / 门禁），绝对定位 z=1，
 *              压在天空画布之上、铃哲主体（z=2）与文字（z=10）之下，永远挡不住它们；
 *     page  —— 挂在站点布局里，fixed z=0，内页正文自己抬到 z=1，粒子只在底下飘。
 * - 窄屏：舞台下半有一层文案底衬（.hero-text-scrim）压在粒子之上，会把粒子盖没。
 *   所以 stage 挂法接受 narrow 参数（底衬消失的断点），断点以下由 globals.css
 *   把粒子的起点整体抬到舞台上半、缩短上浮距离并提亮，让它们在标题、人像、表单
 *   之外的夜空与缝隙里仍然看得见。
 * - pointer-events: none，不吃点击；prefers-reduced-motion 时在 globals.css 里整层静止。
 */

/* 粒子两种行为：dust 缓慢上浮并横向微漂，spark 原地呼吸闪烁 */
type DustKind = "dust" | "spark";

type Particle = {
  kind: DustKind;
  /** 颜色：青 / 琥珀 */
  tone: "cyan" | "amber";
  /** 水平位置（%） */
  x: number;
  /** 垂直起点（%，从底部算） */
  y: number;
  /** 直径 px */
  size: number;
  /** 峰值透明度 */
  opacity: number;
  /** 上浮高度（vh） */
  rise: number;
  /** 横向漂移（px，可负） */
  drift: number;
  /** 周期 s */
  duration: number;
  /** 负延迟 s，让粒子开场就处在各自不同的相位 */
  delay: number;
};

/** mulberry32：极小的确定性随机数，保证 SSR / CSR 产出同一组粒子 */
function makeRng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** 生成 count 枚粒子；seed 不同则分布不同，同一 seed 永远相同 */
function buildParticles(count: number, seed: number): Particle[] {
  const rnd = makeRng(seed);
  const between = (lo: number, hi: number) => lo + rnd() * (hi - lo);

  return Array.from({ length: count }, () => {
    const kind: DustKind = rnd() < 0.3 ? "spark" : "dust";
    return {
      kind,
      /* 青多琥珀少，和夜街的光源比例一致 */
      tone: rnd() < 0.68 ? "cyan" : "amber",
      x: between(0, 100),
      /* dust 从下半屏起飞；spark 散在整幅画面 */
      y: kind === "dust" ? between(-6, 70) : between(8, 92),
      size: kind === "dust" ? between(1.4, 3.2) : between(1.8, 3.8),
      opacity: kind === "dust" ? between(0.35, 0.75) : between(0.45, 0.9),
      rise: between(22, 46),
      drift: between(-34, 34),
      duration: kind === "dust" ? between(11, 22) : between(2.6, 5.2),
      delay: -between(0, 22),
    };
  });
}

/* 两个挂法各自固定一套粒子，模块加载时算一次即可 */
const STAGE_PARTICLES = buildParticles(34, 710);
const PAGE_PARTICLES = buildParticles(16, 2025);

export function NightDust({
  scope = "stage",
  narrow = "md",
}: {
  /** stage：主视觉舞台内；page：站点布局底层 */
  scope?: "stage" | "page";
  /**
   * 窄屏断点：舞台的文案底衬在哪个断点以下显示（首页 md、门禁 lg），
   * 粒子就在同一断点以下抬到底衬之上。仅 stage 挂法生效。
   */
  narrow?: "md" | "lg";
}) {
  const particles = scope === "stage" ? STAGE_PARTICLES : PAGE_PARTICLES;
  const narrowClass = scope === "stage" ? ` night-dust--narrow-${narrow}` : "";

  return (
    <div aria-hidden className={`night-dust night-dust--${scope}${narrowClass}`}>
      {particles.map((p, i) => (
        <i
          key={i}
          className={`nd nd--${p.kind} nd--${p.tone}`}
          style={
            {
              "--x": `${p.x.toFixed(2)}%`,
              "--y": `${p.y.toFixed(2)}%`,
              "--s": `${p.size.toFixed(2)}px`,
              "--o": p.opacity.toFixed(2),
              "--rise": `${p.rise.toFixed(1)}vh`,
              "--drift": `${p.drift.toFixed(1)}px`,
              "--dur": `${p.duration.toFixed(2)}s`,
              "--delay": `${p.delay.toFixed(2)}s`,
            } as CSSProperties
          }
        />
      ))}
    </div>
  );
}
