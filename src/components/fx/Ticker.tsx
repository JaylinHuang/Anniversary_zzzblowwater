/** 街牌跑马灯：条目复制两份首尾相接，减少动态时自动换行静止 */
export function Ticker({
  items,
  className = "",
}: {
  items: string[];
  className?: string;
}) {
  const row = (key: string, hidden: boolean) => (
    <div className="ticker-track" key={key} aria-hidden={hidden}>
      {items.map((t, i) => (
        <span key={i} className="mono inline-flex items-center gap-2.5 text-[0.72rem] tracking-[0.22em] uppercase">
          <span className="inline-block h-1.5 w-1.5 rotate-45 bg-[var(--amber)]" />
          {t}
        </span>
      ))}
    </div>
  );
  return (
    <div className={`ticker ${className}`}>
      {row("a", false)}
      {row("b", true)}
    </div>
  );
}
